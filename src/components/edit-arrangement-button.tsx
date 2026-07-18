"use client";

import { useState } from "react";
import { Edit3 } from "lucide-react";
import { updateSongSlotArrangementAction } from "@/app/actions";
import { ArrangementEditor } from "./arrangement-editor";

export function EditArrangementButton({
  setlistId,
  slotId,
  songTitle,
  currentArrangement,
  lyrics,
}: {
  setlistId: string;
  slotId: string;
  songTitle: string;
  currentArrangement?: string | null;
  lyrics: string;
}) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleSave = async (newArrangement: string) => {
    if (newArrangement !== currentArrangement) {
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("slotId", slotId);
      formData.set("arrangement", newArrangement);
      await updateSongSlotArrangementAction(formData);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsEditorOpen(true)}
        aria-label="Edit arrangement"
        className="rounded-lg p-1.5 text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition inline-flex"
      >
        <Edit3 className="size-4" />
      </button>

      <ArrangementEditor
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSave}
        songTitle={songTitle}
        initialArrangement={currentArrangement || ""}
        lyrics={lyrics}
      />
    </>
  );
}
