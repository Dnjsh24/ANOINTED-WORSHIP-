"use client";

import type { RehearsalSong } from "@/lib/domain/rehearsal-plan";

const field = "min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white disabled:opacity-60";

export function RehearsalSongFields({ song, index, focus, minutes, disabled = false, onFocusChange, onMinutesChange }: {
  song: RehearsalSong;
  index: number;
  focus: string;
  minutes: number;
  disabled?: boolean;
  onFocusChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-lg border border-white/10 p-3">
      <legend className="max-w-full break-words px-1 font-semibold">
        {index + 1}. {song.title} <span className="text-sm text-zinc-400">· Key {song.assignedKey}</span>
      </legend>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <label className="grid min-w-0 gap-1 text-xs text-zinc-300">
          Focus
          <input
            aria-label={`Focus for ${song.title}`} type="text" maxLength={500}
            value={focus} disabled={disabled} onChange={event => onFocusChange(event.target.value)}
            placeholder="Intro, harmonies, transitions…" className={field}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-zinc-300">
          Minutes
          <input
            aria-label={`Minutes for ${song.title}`} type="number" min={0} max={120} step={1}
            value={minutes} disabled={disabled} onChange={event => onMinutesChange(event.target.value)}
            className={field}
          />
        </label>
      </div>
    </fieldset>
  );
}
