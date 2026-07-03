"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfilePhotoAction } from "@/app/actions";
import { profileAvatarBucket, profileAvatarStoragePath, validateProfileAvatar } from "@/lib/domain/files";
import { createClient } from "@/lib/supabase/client";

export function PhotoPickerButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function uploadPhoto(file: File) {
    const validation = validateProfileAvatar(file);
    if (!validation.valid) {
      setStatus(validation.reason ?? "Choose a different photo.");
      return;
    }

    setIsUploading(true);
    setStatus("Uploading photo...");

    const supabase = createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setStatus("Sign in again before changing your photo.");
        return;
      }

      const objectId = crypto.randomUUID();
      const path = profileAvatarStoragePath(user.id, objectId, file);
      const { error: uploadError } = await supabase.storage.from(profileAvatarBucket).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

      if (uploadError) {
        setStatus(readableUploadError(uploadError.message));
        return;
      }

      const { data } = supabase.storage.from(profileAvatarBucket).getPublicUrl(path);
      const formData = new FormData();
      formData.set("avatarUrl", data.publicUrl);
      const result = await updateProfilePhotoAction(formData);

      if (!result.ok) {
        await supabase.storage.from(profileAvatarBucket).remove([path]);
        setStatus(result.message || "Profile photo could not be saved.");
        return;
      }

      setStatus("Profile photo updated.");
      router.refresh();
    } catch {
      setStatus("Profile photo upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="mt-4 w-full text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadPhoto(file);
          } else {
            setStatus("");
          }
        }}
      />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? "Uploading..." : "Change Photo"}
      </button>
      {status ? (
        <p aria-live="polite" className="mt-2 text-[10px] font-semibold text-zinc-500">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function readableUploadError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("bucket") || normalized.includes("not found")) {
    return "Profile photo storage is not ready yet. Apply the latest Supabase migration, then try again.";
  }

  if (normalized.includes("row-level security") || normalized.includes("permission") || normalized.includes("policy")) {
    return "Supabase blocked the upload. Please apply the latest profile avatar storage policy.";
  }

  return "Photo upload failed. Please try a JPG, PNG, or WebP image under 5 MB.";
}
