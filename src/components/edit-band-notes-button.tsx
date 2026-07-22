"use client";

import { useState, useTransition } from "react";
import { updateSetlistSongNotesAction } from "@/app/actions";

export function EditBandNotesButton({
  setlistId,
  slotId,
  currentNotes,
}: {
  setlistId: string;
  slotId: string;
  currentNotes?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = (formData: FormData) => {
    startTransition(async () => {
      const res = await updateSetlistSongNotesAction(formData);
      if (res.ok) setOpen(false);
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded bg-[#18171c] px-3 text-xs font-bold text-white transition hover:bg-zinc-800"
      >
        {currentNotes ? "Edit Notes" : "Add Notes"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setOpen(false)} 
          />
          <div className="relative w-full max-w-md rounded-2xl bg-[#0f0e14] border border-white/10 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Band Notes</h2>
            <form action={handleSave} className="flex flex-col gap-4">
              <input type="hidden" name="setlistId" value={setlistId} />
              <input type="hidden" name="slotId" value={slotId} />

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-zinc-400">Notes (Instructions for the band)</label>
                <input
                  name="bandNotes"
                  type="text"
                  defaultValue={currentNotes || ""}
                  placeholder="e.g. Vamp intro, no drums on verse 1"
                  className="h-10 rounded-lg border border-white/10 bg-[#18171c] px-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Notes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
