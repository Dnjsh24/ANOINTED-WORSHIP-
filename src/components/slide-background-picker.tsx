"use client";

import { useState, useTransition } from "react";
import { updateSlideSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, PaintBucket } from "lucide-react";
import { createOptionalClient } from "@/lib/supabase/client";
import { buildSlideBackgroundPath, validateSlideBackgroundFile } from "@/lib/domain/slide-background";

export interface SlideSettings {
  backgroundType: "color" | "gradient" | "image";
  backgroundValue: string;
}

export function SlideBackgroundPicker({
  setlistSongId,
  teamId,
  initialSettings,
}: {
  setlistSongId: string;
  teamId: string;
  initialSettings?: SlideSettings | null;
}) {
  const [settings, setSettings] = useState<SlideSettings>(
    initialSettings || { backgroundType: "color", backgroundValue: "#000000" }
  );
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [, startTransition] = useTransition();

  const handleSave = async (newSettings: SlideSettings) => {
    setSettings(newSettings);
    
    const formData = new FormData();
    formData.set("setlistSongId", setlistSongId);
    formData.set("slideSettings", JSON.stringify(newSettings));
    
    startTransition(async () => {
      const result = await updateSlideSettingsAction(formData);
      setStatus(result.message);
    });
  };

  const uploadImage = async (file: File) => {
    if (!teamId) return;
    const validation = validateSlideBackgroundFile(file);
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }
    const supabase = createOptionalClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus("Sign in before uploading a slide background.");
      return;
    }
    const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const path = buildSlideBackgroundPath(teamId, user.id, objectId, validation.extension);
    
    const { error } = await supabase.storage
      .from("presentation-media")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (error) {
      setStatus("The slide background could not be uploaded.");
      return;
    }

    await handleSave({ backgroundType: "image", backgroundValue: path });
  };

  return (
    <div className="relative inline-block text-left">
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 gap-2 border border-white/10 bg-white/5 text-xs text-white hover:bg-white/10"
      >
        <PaintBucket className="size-3.5" />
        Background
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/10 bg-[#16151a] p-4 shadow-2xl">
          <h4 className="mb-3 text-xs font-bold text-zinc-400 uppercase tracking-wider">Slide Background</h4>
          
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-white">Solid Color</p>
              <div className="flex gap-2 flex-wrap">
                {["#000000", "#1e1b4b", "#4c1d95", "#831843", "#064e3b"].map(color => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`Use solid color ${color}`}
                    className={`size-11 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${settings.backgroundValue === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleSave({ backgroundType: "color", backgroundValue: color })}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-white">Gradient</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  "linear-gradient(to bottom right, #000000, #4c1d95)",
                  "linear-gradient(to top right, #1e1b4b, #831843)",
                  "radial-gradient(circle at center, #064e3b, #000000)"
                ].map((grad, index) => (
                  <button
                    type="button"
                    key={grad}
                    aria-label={`Use gradient ${index + 1}`}
                    className={`size-11 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${settings.backgroundValue === grad ? 'border-white' : 'border-transparent'}`}
                    style={{ background: grad }}
                    onClick={() => handleSave({ backgroundType: "gradient", backgroundValue: grad })}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-white">Custom Image</p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-white/20 p-3 text-xs font-semibold text-zinc-400 hover:bg-white/5">
                <ImageIcon className="size-4" />
                Upload Image
                <input
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) uploadImage(e.target.files[0]);
                  }}
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-300" role="status" aria-live="polite">{status}</p>
        </div>
      )}
    </div>
  );
}
