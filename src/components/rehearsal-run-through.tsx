"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RehearsalAllocation, RehearsalSong } from "@/lib/domain/rehearsal-plan";

export function RehearsalRunThrough({ songs, allocations }: {
  songs: RehearsalSong[];
  allocations: Record<string, RehearsalAllocation>;
}) {
  const [songId, setSongId] = useState(songs[0]?.id ?? "");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      if (startedAt.current !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  const index = songs.findIndex(song => song.id === songId);
  const song = songs[index];
  if (!song) return null;
  const nextSong = songs[index + 1];
  const allocation = allocations[song.id] ?? { minutes: 5, focus: "" };
  const remainingSeconds = allocation.minutes * 60 - elapsedSeconds;

  function reset() {
    setRunning(false);
    setElapsedSeconds(0);
    startedAt.current = null;
  }

  function selectSong(id: string) {
    reset();
    setSongId(id);
  }

  function toggleTimer() {
    if (running) {
      if (startedAt.current !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
      }
      setRunning(false);
    } else {
      startedAt.current = Date.now() - elapsedSeconds * 1000;
      setRunning(true);
    }
  }

  return (
    <section aria-label="Rehearsal run-through" className="space-y-4 rounded-lg border border-violet-300/20 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-violet-100">Rehearsal run-through</h3>
          <p className="mt-1 text-xs text-zinc-400">Keep each song on time. Timer runs on this device while this page stays open.</p>
          <label className="mt-3 grid gap-1 text-xs text-zinc-300">
            Rehearsing song
            <select
              value={song.id} onChange={event => selectSong(event.target.value)}
              className="min-h-11 w-full min-w-0 rounded border border-white/20 bg-zinc-900 px-3 text-sm text-white"
            >
              {songs.map((item, itemIndex) => <option key={item.id} value={item.id}>{itemIndex + 1}. {item.title}</option>)}
            </select>
          </label>
          <p className="mt-2 text-sm text-zinc-300">Key {song.assignedKey}{song.bpm ? ` · ${song.bpm} BPM` : ""}{song.lead ? ` · Lead: ${song.lead}` : ""}</p>
          {song.arrangement && <p className="mt-1 break-words text-sm text-zinc-400">Arrangement: {song.arrangement}</p>}
          <p className="mt-2 break-words text-sm text-white">Focus: {allocation.focus.trim() || "Agree the intro, harmonies, and transition together."}</p>
        </div>
        <div className="shrink-0">
          <p className={remainingSeconds <= 0 ? "text-xs text-amber-200" : "text-xs text-zinc-400"}>
            {remainingSeconds < 0 ? "Overtime" : remainingSeconds === 0 ? "Time is up" : "Time remaining"}
          </p>
          <p role="timer" aria-label={remainingSeconds < 0 ? "Rehearsal overtime" : "Rehearsal time remaining"} aria-live="off"
            className={`mt-1 text-4xl font-bold tabular-nums ${remainingSeconds <= 0 ? "text-amber-200" : "text-violet-100"}`}>
            {formatDuration(Math.abs(remainingSeconds))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!running && allocation.minutes === 0} onClick={toggleTimer}>
          {running ? "Pause timer" : elapsedSeconds > 0 ? "Resume timer" : "Start timer"}
        </Button>
        <Button type="button" variant="secondary" onClick={reset}>Reset timer</Button>
        <Button type="button" variant="secondary" disabled={!nextSong} onClick={() => nextSong && selectSong(nextSong.id)}>Next song</Button>
      </div>
      <p className="break-words text-xs text-zinc-400">{nextSong ? `Up next: ${nextSong.title} · Key ${nextSong.assignedKey}` : "Last song in the rehearsal plan."}</p>
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
