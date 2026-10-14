"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function PracticeSongTimer({ songTitle, minutes }: { songTitle: string; minutes: number }) {
  const [remainingSeconds, setRemainingSeconds] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const deadline = useRef<number | null>(null);
  const pausedSeconds = useRef(minutes * 60);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      if (deadline.current !== null) {
        const remaining = Math.ceil((deadline.current - Date.now()) / 1000);
        pausedSeconds.current = remaining;
        setRemainingSeconds(remaining);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  function toggleTimer() {
    if (running) {
      if (deadline.current !== null) pausedSeconds.current = Math.ceil((deadline.current - Date.now()) / 1000);
      setRemainingSeconds(pausedSeconds.current);
      deadline.current = null;
      setRunning(false);
      return;
    }
    deadline.current = Date.now() + pausedSeconds.current * 1000;
    setStarted(true);
    setRunning(true);
  }

  function resetTimer() {
    pausedSeconds.current = minutes * 60;
    deadline.current = null;
    setRemainingSeconds(pausedSeconds.current);
    setRunning(false);
    setStarted(false);
  }

  const isOvertime = remainingSeconds < 0;

  return (
    <section aria-label={`${songTitle} rehearsal timer`} className="space-y-3 rounded-lg border border-violet-300/20 bg-violet-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Song timer</h3>
          <p className="mt-1 text-xs text-zinc-400">{minutes} allocated {minutes === 1 ? "minute" : "minutes"} for {songTitle}</p>
        </div>
        <div className="text-right">
          <p className={`text-xs ${isOvertime ? "text-amber-200" : "text-zinc-400"}`}>
            {isOvertime ? "Overtime" : remainingSeconds === 0 ? "Time is up" : "Time remaining"}
          </p>
          <p role="timer" aria-label={isOvertime ? "Rehearsal overtime" : "Rehearsal time remaining"} aria-live="off" className={`mt-1 text-3xl font-bold tabular-nums ${isOvertime ? "text-amber-200" : "text-violet-100"}`}>
            {formatDuration(Math.abs(remainingSeconds))}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!running && minutes === 0} onClick={toggleTimer}>
          {running ? "Pause timer" : started ? "Resume timer" : "Start timer"}
        </Button>
        <Button type="button" variant="secondary" onClick={resetTimer}>Reset timer</Button>
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
