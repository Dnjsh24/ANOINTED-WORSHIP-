"use client";

import { Trash2 } from "lucide-react";
import { removeSetlistSongAction } from "@/app/actions";

export function DeleteSongButton({
  setlistId,
  slotId,
  songTitle,
}: {
  setlistId: string;
  slotId: string;
  songTitle: string;
}) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const confirmed = window.confirm(
      `Are you sure you want to remove "${songTitle}" from this setlist?`
    );
    if (confirmed) {
      const formData = new FormData(e.currentTarget);
      await removeSetlistSongAction(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="inline-flex">
      <input type="hidden" name="setlistId" value={setlistId} />
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        aria-label="Remove song"
        className="rounded-lg p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  );
}
