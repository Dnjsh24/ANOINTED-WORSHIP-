"use client";

import React, { useState } from "react";
import { CheckSquare, Square, Plus, Trash2, ShieldCheck, Sparkles } from "lucide-react";
import {
  getSongChecklist,
  saveSongChecklist,
  getSongConfidence,
  setSongConfidence,
  type ChecklistItem,
  type ReadinessRating,
} from "@/lib/domain/practice-features";
import { cn } from "@/lib/utils";

type PracticeChecklistProps = {
  setlistId: string;
  songSlotId: string;
  songTitle: string;
  onRatingChange?: (rating: ReadinessRating | null) => void;
};

export function PracticeChecklist({
  setlistId,
  songSlotId,
  songTitle,
  onRatingChange,
}: PracticeChecklistProps) {
  const [prevSlotId, setPrevSlotId] = useState(songSlotId);
  const [items, setItems] = useState<ChecklistItem[]>(() => getSongChecklist(setlistId, songSlotId));
  const [rating, setRating] = useState<ReadinessRating | null>(() => getSongConfidence(setlistId, songSlotId));
  const [newText, setNewText] = useState("");

  if (prevSlotId !== songSlotId) {
    setPrevSlotId(songSlotId);
    setItems(getSongChecklist(setlistId, songSlotId));
    setRating(getSongConfidence(setlistId, songSlotId));
  }

  const handleToggleItem = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item,
    );
    setItems(updated);
    saveSongChecklist(setlistId, songSlotId, updated);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    const newItem: ChecklistItem = {
      id: `chk_${Date.now()}`,
      text: newText.trim(),
      completed: false,
    };
    const updated = [...items, newItem];
    setItems(updated);
    saveSongChecklist(setlistId, songSlotId, updated);
    setNewText("");
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    saveSongChecklist(setlistId, songSlotId, updated);
  };

  const handleSelectRating = (newRating: ReadinessRating) => {
    const next = rating === newRating ? null : newRating;
    setRating(next);
    setSongConfidence(setlistId, songSlotId, next);
    if (onRatingChange) onRatingChange(next);
  };

  const completedCount = items.filter((i) => i.completed).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-zinc-900 border border-white/10 text-white w-full max-w-md shadow-xl select-none">
      {/* Header & Confidence Rating */}
      <div className="flex flex-col gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-violet-400" />
            Song Readiness Rating
          </span>
          <span className="text-[11px] font-semibold text-zinc-400 truncate max-w-[150px]">
            {songTitle}
          </span>
        </div>

        {/* Rating Buttons */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          <button
            type="button"
            onClick={() => handleSelectRating("NOT_READY")}
            className={cn(
              "flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-bold transition",
              rating === "NOT_READY"
                ? "bg-red-950/80 border-red-500 text-red-200 ring-2 ring-red-500/40"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10",
            )}
          >
            <span className="text-sm mb-0.5">🔴</span>
            <span>Needs Work</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRating("GETTING_THERE")}
            className={cn(
              "flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-bold transition",
              rating === "GETTING_THERE"
                ? "bg-amber-950/80 border-amber-500 text-amber-200 ring-2 ring-amber-500/40"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10",
            )}
          >
            <span className="text-sm mb-0.5">🟡</span>
            <span>Getting There</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectRating("READY")}
            className={cn(
              "flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-bold transition",
              rating === "READY"
                ? "bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/40"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10",
            )}
          >
            <span className="text-sm mb-0.5">🟢</span>
            <span>Service Ready</span>
          </button>
        </div>
      </div>

      {/* Checklist Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-emerald-400" />
            Practice Goals
          </span>
          <span className="text-zinc-400 font-mono text-[11px]">
            {completedCount} / {items.length} ({progressPercent}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Item List */}
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto no-scrollbar pr-1 mt-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-2 rounded-lg border transition text-xs",
                item.completed
                  ? "bg-emerald-950/30 border-emerald-500/30 text-zinc-400 line-through"
                  : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10",
              )}
            >
              <button
                type="button"
                onClick={() => handleToggleItem(item.id)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                {item.completed ? (
                  <CheckSquare className="size-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="size-4 text-zinc-400 shrink-0" />
                )}
                <span>{item.text}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(item.id)}
                className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-white/5 shrink-0"
                title="Delete goal"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Item Form */}
        <form onSubmit={handleAddItem} className="flex items-center gap-2 mt-2">
          <input
            type="text"
            placeholder="Add new practice goal..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition shrink-0"
            title="Add goal"
          >
            <Plus className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
