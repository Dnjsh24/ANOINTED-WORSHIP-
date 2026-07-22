"use client";

import { useState, useTransition } from "react";
import { updateSlideSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, PaintBucket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SlideSettings {
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
  const [isPending, startTransition] = useTransition();

  const handleSave = async (newSettings: SlideSettings) => {
    setSettings(newSettings);
    
    const formData = new FormData();
    formData.set("setlistSongId", setlistSongId);
    formData.set("slideSettings", JSON.stringify(newSettings));
    
    startTransition(async () => {
      await updateSlideSettingsAction(formData);
    });
  };

  const uploadImage = async (file: File) => {
    if (!teamId) return;
    const supabase = createClient();
    const objectId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const path = `${teamId}/slide-backgrounds/${objectId}-${file.name}`;
    
    const { error } = await supabase.storage
      .from("practice-files") // using existing bucket for simplicity
      .upload(path, file);

    if (error) {
      console.error("Upload failed", error);
      return;
    }

    const { data } = await supabase.storage
      .from("practice-files")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

    if (data?.signedUrl) {
      handleSave({ backgroundType: "image", backgroundValue: data.signedUrl });
    }
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
                    key={color}
                    className={`size-6 rounded-full border-2 ${settings.backgroundValue === color ? 'border-white' : 'border-transparent'}`}
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
                ].map(grad => (
                  <button
                    key={grad}
                    className={`size-6 rounded-full border-2 ${settings.backgroundValue === grad ? 'border-white' : 'border-transparent'}`}
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
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) uploadImage(e.target.files[0]);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
