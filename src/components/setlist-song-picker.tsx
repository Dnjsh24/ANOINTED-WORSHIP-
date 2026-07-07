"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Song } from "@/lib/types";
import { ChevronDown, Folder, Plus, Search, SlidersHorizontal, Loader2, X, Music, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addMultipleSetlistSongsAction } from "@/app/actions";

type StagedSong = {
  song: Song;
  type: "Worship" | "Praise" | "None";
};

export function SetlistSongPicker({
  setlistId,
  songs,
}: {
  setlistId: string;
  songs: Song[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("all");
  const [stagedSongs, setStagedSongs] = useState<StagedSong[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const keyOptions = useMemo(() => {
    const keys = songs.map((song) => song.currentKey || song.originalKey).filter(Boolean);
    return ["all", ...Array.from(new Set(keys))];
  }, [songs]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return songs.filter((song) => {
      // Don't show songs that are already in the staging box
      if (stagedSongs.some(s => s.song.id === song.id)) return false;

      const matchesQuery = `${song.title} ${song.artist} ${song.tags.join(" ")}`.toLowerCase().includes(normalized);
      const songKey = song.currentKey || song.originalKey;
      const matchesKey = selectedKey === "all" || songKey === selectedKey;
      return matchesQuery && matchesKey;
    });
  }, [query, selectedKey, songs, stagedSongs]);

  const addSongToStaging = (song: Song) => {
    setStagedSongs(prev => [...prev, { song, type: "None" }]);
  };

  const removeSongFromStaging = (songId: string) => {
    setStagedSongs(prev => prev.filter(s => s.song.id !== songId));
  };

  const updateSongType = (songId: string, type: "Worship" | "Praise" | "None") => {
    setStagedSongs(prev => prev.map(s => s.song.id === songId ? { ...s, type } : s));
  };

  const handleSave = () => {
    if (stagedSongs.length === 0) return;
    setErrorMsg("");
    
    startTransition(async () => {
      const payload = stagedSongs.map(s => ({
        songId: s.song.id,
        assignedKey: s.song.currentKey || s.song.originalKey || "C",
        type: s.type
      }));

      const res = await addMultipleSetlistSongsAction(setlistId, payload);
      if (res.ok) {
        router.push(`/setlists/${setlistId}`);
      } else {
        setErrorMsg(res.message || "Failed to add songs");
      }
    });
  };

  return (
    <div className="space-y-6 text-left animate-fade-in flex flex-col h-[75vh]">
      
      {/* Search & Filter row */}
      <div className="flex gap-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <Input placeholder="Search library to add..." value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" />
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
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 shrink-0">
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

      {/* Song List Rows (Library) */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-2 min-h-0">
        {filtered.map((song) => (
          <div
            key={song.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300">
                <Music className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{song.title}</p>
                <p className="text-[10px] font-semibold text-zinc-400 truncate">{song.artist}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-bold text-zinc-300">
                {song.currentKey || song.originalKey}
              </span>
              <button
                type="button"
                onClick={() => addSongToStaging(song)}
                className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-400 transition hover:bg-violet-600 hover:text-white"
                title="Stage for Setlist"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-xs font-semibold text-zinc-600">No more songs match search.</p>
        )}
      </div>

      {/* Staging Area ("Bottom Box") */}
      <div className="shrink-0 pt-4 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-violet-300 mb-3 flex items-center gap-2">
          Staging Box <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-[10px]">{stagedSongs.length}</span>
        </h3>
        
        <div className="border border-violet-500/20 rounded-xl bg-violet-950/20 p-4 space-y-3 max-h-[220px] overflow-y-auto">
          {stagedSongs.length === 0 ? (
            <p className="text-center text-xs font-medium text-zinc-500 py-6">
              Click the <Plus className="size-3 inline mx-1" /> button on songs above to add them to your staging box.
            </p>
          ) : (
            stagedSongs.map((staged) => (
              <div key={staged.song.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-black/40 border border-white/5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{staged.song.title}</p>
                  <p className="text-[10px] text-zinc-400">Key: {staged.song.currentKey || staged.song.originalKey}</p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {/* Type Toggle */}
                  <div className="flex items-center rounded-lg border border-white/10 p-0.5 bg-black/50">
                    <button 
                      onClick={() => updateSongType(staged.song.id, "Worship")}
                      className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase transition", staged.type === "Worship" ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      Worship
                    </button>
                    <button 
                      onClick={() => updateSongType(staged.song.id, "Praise")}
                      className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase transition", staged.type === "Praise" ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      Praise
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => removeSongFromStaging(staged.song.id)}
                    className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm font-semibold text-red-400 border border-red-500/20">
          {errorMsg}
        </div>
      )}

      {/* Bottom Button Row */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.04] shrink-0">
        <ButtonLink href={`/setlists/${setlistId}`} variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
          Cancel
        </ButtonLink>
        <button 
          onClick={handleSave}
          disabled={isPending || stagedSongs.length === 0}
          className="flex items-center justify-center min-w-[140px] rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:pointer-events-none transition"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4" /> Save to Setlist
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
