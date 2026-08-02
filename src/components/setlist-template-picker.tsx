"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

export type SetlistTemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  slots?: unknown;
};

export function SetlistTemplatePicker({ templates }: { templates: SetlistTemplateSummary[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialogRef = useAccessibleDialog({ open: isOpen, onClose: () => setIsOpen(false) });

  if (!templates || templates.length === 0) return null;

  return (
    <>
      <Button 
        variant="secondary" 
        onClick={() => setIsOpen(true)}
        className="rounded-xl px-4 py-2 text-xs font-bold"
      >
        <Copy className="mr-2 size-4" />
        Use Template
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="template-picker-title" tabIndex={-1} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#16151a] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 id="template-picker-title" className="text-xl font-bold text-white">Choose a Template</h2>
              <button 
                type="button"
                aria-label="Close template picker"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto pr-2">
              {templates.map(t => (
                <button
                  type="button"
                  key={t.id}
                  className="w-full rounded-xl border border-white/[0.04] bg-[#1a191f] p-4 text-left transition-colors hover:border-violet-500/50 hover:bg-[#1f1e24]"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("templateId", t.id);
                    router.push(`?${params.toString()}`);
                    setIsOpen(false);
                  }}
                >
                  <h3 className="font-bold text-white">{t.name}</h3>
                  {t.description && <p className="text-xs text-zinc-400 mt-1">{t.description}</p>}
                  <p className="text-xs text-violet-400 mt-2 font-medium">
                    {Array.isArray(t.slots) ? t.slots.length : 0} slots
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
