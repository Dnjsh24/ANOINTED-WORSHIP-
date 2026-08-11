"use client";

import { useState } from "react";
import { Edit3 } from "lucide-react";
import { updateSongSlotArrangementAction } from "@/app/actions";
import { ArrangementEditor } from "./arrangement-editor";
import {
  serializeArrangementSections,
  type ArrangementSection,
} from "@/lib/domain/arrangements";

export function EditArrangementButton({
  setlistId,
  slotId,
  songTitle,
  currentArrangement,
  currentArrangementSections,
  lyrics,
}: {
  setlistId: string;
  slotId: string;
  songTitle: string;
  currentArrangement?: string | null;
  currentArrangementSections?: ArrangementSection[] | null;
  lyrics: string;
}) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handleSave = async (
    newArrangement: string,
    arrangementSections: ArrangementSection[],
  ) => {
    const serializedSections = serializeArrangementSections(arrangementSections);
    const currentSerializedSections = currentArrangementSections
      ? serializeArrangementSections(currentArrangementSections)
      : null;
    if (
      newArrangement !== currentArrangement
      || serializedSections !== currentSerializedSections
    ) {
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("slotId", slotId);
      formData.set("arrangement", newArrangement);
      formData.set("arrangementSections", serializedSections);
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

      {isEditorOpen && (
        <ArrangementEditor
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSave}
          songTitle={songTitle}
          initialArrangement={currentArrangement || ""}
          initialSections={currentArrangementSections}
          lyrics={lyrics}
        />
      )}
    </>
  );
}
