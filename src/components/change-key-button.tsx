"use client";

import { useState } from "react";
import { updateSetlistSongKeyAction } from "@/app/actions";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

export function ChangeKeyButton({
  setlistId,
  slotId,
  currentKey,
  originalKey,
}: {
  setlistId: string;
  slotId: string;
  currentKey: string;
  originalKey: string;
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  const isMinor = originalKey?.endsWith("m");
  const activeKeys = isMinor ? MINOR_KEYS : MAJOR_KEYS;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newKey = e.target.value;
    if (newKey !== currentKey) {
      setIsUpdating(true);
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("slotId", slotId);
      formData.set("assignedKey", newKey);
      await updateSetlistSongKeyAction(formData);
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-semibold text-zinc-400">Key:</span>
      <select
        value={currentKey}
        onChange={handleChange}
        disabled={isUpdating}
        className="inline-flex items-center rounded-md border border-transparent bg-zinc-800 px-1 py-0.5 text-xs font-bold text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#111014] disabled:opacity-50 appearance-none text-center cursor-pointer min-w-[2.5rem]"
      >
        {activeKeys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </div>
  );
}
