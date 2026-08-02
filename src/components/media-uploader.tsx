"use client";

import { useMemo, useState } from "react";
import { X, Loader2, Image as ImageIcon, Film } from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface MediaUploaderProps {
  currentUrl?: string;
  currentType?: "image" | "video";
  onUpload: (url: string, type: "image" | "video") => void;
  onClear: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function MediaUploader({ currentUrl, currentType, onUpload, onClear }: MediaUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createOptionalClient(), []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError("File is too large. Please compress your video to under 5MB. We recommend using a free tool like FreeConvert.com");
      return;
    }

    // Validate type
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      setError("Unsupported file format.");
      return;
    }

    try {
      setIsUploading(true);

      if (!supabase) {
        throw new Error("Sign in with Supabase before uploading presentation media.");
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sign in before uploading presentation media.");

      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (membershipError || !membership?.team_id) {
        throw new Error("Join an active team before uploading presentation media.");
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${membership.team_id}/${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("presentation-media")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("presentation-media")
        .getPublicUrl(filePath);

      onUpload(publicUrlData.publicUrl, isVideo ? "video" : "image");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to upload media.");
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Background Media</label>
      
      {currentUrl ? (
        <div className="relative group rounded-md overflow-hidden bg-black/40 border border-white/10 aspect-video flex items-center justify-center">
          {currentType === "video" ? (
            <video src={currentUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          ) : (
             // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} className="w-full h-full object-cover" alt="Background" />
          )}
          
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              type="button"
              onClick={onClear}
              aria-label="Remove background media"
              className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-colors"
              title="Remove Media"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <label className={cn(
          "relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer aspect-video",
          error ? "border-red-500/50 bg-red-500/5" : "border-white/10 hover:border-white/20 bg-black/20 hover:bg-black/40",
          isUploading && "pointer-events-none opacity-50"
        )}>
          <input 
            type="file" 
            className="hidden" 
            accept="image/*,video/mp4,video/webm"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center text-zinc-400 gap-2">
              <Loader2 className="size-6 animate-spin text-amber-500" />
              <span className="text-xs font-medium">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-zinc-500 gap-2 text-center">
              <div className="flex gap-2">
                <ImageIcon className="size-5" />
                <Film className="size-5" />
              </div>
              <div className="text-xs">
                <span className="font-semibold text-zinc-300">Click to upload</span>
                <p className="mt-1 opacity-70">Images or Video (Max 5MB)</p>
              </div>
            </div>
          )}
        </label>
      )}

      {error && (
        <p className="text-[10px] text-red-400 font-medium bg-red-500/10 p-2 rounded border border-red-500/20">
          {error}
        </p>
      )}
    </div>
  );
}
