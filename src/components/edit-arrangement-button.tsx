"use client";

import { Edit3 } from "lucide-react";
import { updateSongSlotArrangementAction } from "@/app/actions";

export function EditArrangementButton({
  setlistId,
  slotId,
  songTitle,
  currentArrangement,
}: {
  setlistId: string;
  slotId: string;
  songTitle: string;
  currentArrangement?: string | null;
}) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newArrangement = window.prompt(
      `Enter arrangement for "${songTitle}" (e.g. Intro, V1, C, V2, C, B, C, Outro):`,
      currentArrangement || ""
    );

    if (newArrangement !== null && newArrangement !== currentArrangement) {
      const formData = new FormData(e.currentTarget);
      formData.set("arrangement", newArrangement);
      await updateSongSlotArrangementAction(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="inline-flex">
      <input type="hidden" name="setlistId" value={setlistId} />
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        aria-label="Edit arrangement"
        className="rounded-lg p-1.5 text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition"
      >
        <Edit3 className="size-4" />
      </button>
    </form>
  );
}
