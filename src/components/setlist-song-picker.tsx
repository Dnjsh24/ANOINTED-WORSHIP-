"use client";

import { useState, useTransition, useMemo } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import type { Song } from "@/lib/types";
import { ChevronDown, Folder, Plus, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function SetlistSongPicker({
  action,
  initialState,
  setlistId,
  songs,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initialState: ActionState;
  setlistId: string;
  songs: Song[];
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [query, setQuery] = useState("");
  const [selectedSong, setSelectedSong] = useState(songs[0]?.id ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("all");

  const keyOptions = useMemo(() => {
    const keys = songs.map((song) => song.currentKey || song.originalKey).filter(Boolean);
    return ["all", ...Array.from(new Set(keys))];
  }, [songs]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return songs.filter((song) => {
      const matchesQuery = `${song.title} ${song.artist} ${song.tags.join(" ")}`.toLowerCase().includes(normalized);
      const songKey = song.currentKey || song.originalKey;
      const matchesKey = selectedKey === "all" || songKey === selectedKey;
      return matchesQuery && matchesKey;
    });
  }, [query, selectedKey, songs]);

  const selected = songs.find((song) => song.id === selectedSong) ?? songs[0];

  return (
    <form action={formAction} className="space-y-6 text-left animate-fade-in">
      <input type="hidden" name="setlistId" value={setlistId} />
      <input type="hidden" name="songId" value={selectedSong} />
      <ActionMessage state={state} />

      {/* Search & Filter row */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <Input placeholder="Search songs..." value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" />
        </div>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
        </button>
      </div>

      {filtersOpen ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Filter by key</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {keyOptions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={cn(
                  "rounded-lg border px-3 py-1 text-[11px] font-bold transition",
                  selectedKey === key
                    ? "border-violet-400/40 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
                )}
              >
                {key === "all" ? "All Keys" : key}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Song List Rows */}
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {filtered.map((song) => {
          const isSelected = selectedSong === song.id;
          return (
            <div
              key={song.id}
              onClick={() => setSelectedSong(song.id)}
              className={cn(
                "flex items-center justify-between gap-4 rounded-xl border p-3 cursor-pointer transition-all duration-150",
                isSelected
                  ? "border-violet-500 bg-violet-500/10 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
              )}
            >
              {/* Folder/Music Icon */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300">
                  <Folder className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{song.title}</p>
                  <p className="text-[10px] font-semibold text-zinc-400 truncate">{song.artist}</p>
                </div>
              </div>

              {/* Badges & Action */}
              <div className="flex items-center gap-4 shrink-0">
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold text-zinc-300">
                  {song.currentKey || song.originalKey}
                </span>
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold text-zinc-300">
                  {song.bpm} BPM
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSong(song.id)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg transition",
                    isSelected ? "bg-violet-600 text-white" : "bg-white/[0.04] text-zinc-400 hover:text-white"
                  )}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-xs font-semibold text-zinc-600">No songs match search.</p>
        )}
      </div>

      {/* Assign details for selection */}
      {selected && (
        <div className="border-t border-white/[0.06] pt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Assigned Key</span>
              <Input name="assignedKey" defaultValue={selected.currentKey} required className="h-10 text-xs font-bold" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">BPM</span>
              <Input type="number" name="bpm" defaultValue={selected.bpm} className="h-10 text-xs font-bold" />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Assign Lead (Optional)</span>
            <div className="relative">
              <input
                name="lead"
                placeholder="Select a member to assign as lead..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-white focus:border-violet-400/50 focus:outline-none"
              />
            </div>
          </label>
        </div>
      )}

      {/* Bottom Button Row */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04]">
        <ButtonLink href={`/setlists/${setlistId}`} variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
          Cancel
        </ButtonLink>
        <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
          Add Song
        </SubmitButton>
      </div>
    </form>
  );
}
