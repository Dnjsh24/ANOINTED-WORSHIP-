"use client";

import React, { useState, useEffect } from "react";
import { Clock, Play, Pause, RotateCcw, History } from "lucide-react";
import {
  getPracticeHistory,
  savePracticeSession,
  type PracticeSessionEntry,
} from "@/lib/domain/practice-features";
import { cn } from "@/lib/utils";

type PracticeSessionTimerProps = {
  setlistId: string;
  activeSongSlotId: string;
  activeSongTitle: string;
  className?: string;
};

export function PracticeSessionTimer({
  setlistId,
  activeSongSlotId,
  activeSongTitle,
  className = "",
}: PracticeSessionTimerProps) {
  const [isRunning, setIsRunning] = useState(true);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [songSeconds, setSongSeconds] = useState<Record<string, number>>({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [history, setHistory] = useState<PracticeSessionEntry[]>([]);

  const handleOpenHistory = () => {
    setHistory(getPracticeHistory(setlistId));
    setShowHistoryModal(true);
  };

  // Main timer interval
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTotalSeconds((prev) => prev + 1);
      setSongSeconds((prev) => ({
        ...prev,
        [activeSongSlotId]: (prev[activeSongSlotId] || 0) + 1,
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, activeSongSlotId]);

  const handleSaveSession = () => {
    if (totalSeconds < 5) return;
    const entry: PracticeSessionEntry = {
      setlistId,
      date: new Date().toISOString(),
      totalSeconds,
      songSeconds,
    };
    savePracticeSession(entry);
    setHistory(getPracticeHistory(setlistId));
  };

  const handleResetSession = () => {
    handleSaveSession();
    setTotalSeconds(0);
    setSongSeconds({});
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const currentSongSecs = songSeconds[activeSongSlotId] || 0;

  return (
    <div className={`flex items-center gap-2 p-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white select-none ${className}`}>
      {/* Play/Pause Toggle */}
      <button
        type="button"
        onClick={() => setIsRunning(!isRunning)}
        className={cn(
          "p-1.5 rounded-md transition",
          isRunning ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400",
        )}
        title={isRunning ? "Pause Practice Timer" : "Resume Practice Timer"}
      >
        {isRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>

      {/* Current Song & Total Session Elapsed Time */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 font-sans font-bold leading-none truncate max-w-[80px]">
            {activeSongTitle}
          </span>
          <span className="text-violet-300 font-bold leading-tight">{formatTime(currentSongSecs)}</span>
        </div>

        <div className="w-px h-5 bg-white/10 mx-1" />

        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 font-sans font-bold leading-none">Total</span>
          <span className="text-zinc-200 font-bold leading-tight">{formatTime(totalSeconds)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 ml-1">
        <button
          type="button"
          onClick={handleOpenHistory}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="View Practice History Log"
        >
          <History className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={handleResetSession}
          className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-white/10 transition"
          title="Save & Reset Timer"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {/* History Log Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col gap-4 p-5 rounded-2xl bg-zinc-900 border border-white/15 text-white w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2">
                <Clock className="size-4 text-violet-400" />
                Practice Session History
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto no-scrollbar pr-1">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-500 italic text-center py-6">
                  No practice history logged yet. Practice sessions will be saved automatically here!
                </p>
              ) : (
                history.map((session, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between font-mono font-bold text-violet-300">
                      <span>{new Date(session.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-zinc-200">{formatTime(session.totalSeconds)}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 flex flex-wrap gap-x-3 gap-y-1 mt-1 pt-1 border-t border-white/5">
                      {Object.entries(session.songSeconds).map(([slot, secs]) => (
                        <span key={slot} className="font-mono">
                          Song: <strong className="text-white">{formatTime(secs)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold text-xs transition"
            >
              Close Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
