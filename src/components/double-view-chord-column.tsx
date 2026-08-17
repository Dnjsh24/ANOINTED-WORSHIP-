"use client";

import type { CSSProperties } from "react";
import { Minus, Plus, Guitar, Repeat } from "lucide-react";
import type { SongSection } from "@/lib/domain/chords";
import { AnnotationCanvas } from "@/components/annotation-canvas";
import { getSectionColorClass } from "@/components/arrangement-flank-sidebar";
import { cn } from "@/lib/utils";

const CAPO_FRETS = Array.from({ length: 12 }, (_, fret) => fret);

type FontScaleStyle = CSSProperties & { "--user-font-scale": number };

export interface DoubleViewChordColumnProps {
  columnKey: string;
  songLabel: string;
  song: {
    id?: string;
    slotId?: string;
    songId?: string;
    title: string;
    bpm?: number | null;
    originalKey?: string;
    assignedKey?: string | null;
    lead?: string;
    arrangement?: string | null;
  } | null;
  selectedKey: string;
  onChangeKey: (direction: number) => void;
  guitarMode: boolean;
  onToggleGuitarMode: () => void;
  capoFret: number;
  onChangeCapoFret: (fret: number) => void;
  fontScale: number;
  displayedSections: SongSection[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setlistId: string;
  stageNotes?: string | null;
  activeLoopIndex?: number | null;
  onToggleLoopSection?: (idx: number) => void;
  onChordClick?: (chord: string) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  emptyStateMessage?: string;
  className?: string;
}

export function DoubleViewChordColumn({
  columnKey,
  songLabel,
  song,
  selectedKey,
  onChangeKey,
  guitarMode,
  onToggleGuitarMode,
  capoFret,
  onChangeCapoFret,
  fontScale,
  displayedSections,
  scrollRef,
  setlistId,
  stageNotes,
  activeLoopIndex,
  onToggleLoopSection,
  onChordClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  emptyStateMessage = "End of Setlist",
  className,
}: DoubleViewChordColumnProps) {
  if (!song) {
    return (
      <div
        className={cn(
          "flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/40 text-zinc-500 select-none border-dashed border-white/5",
          className
        )}
      >
        <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/10 max-w-sm space-y-2">
          <span className="text-xs font-black uppercase tracking-widest text-violet-400">
            {songLabel}
          </span>
          <h3 className="text-lg font-bold text-zinc-300">{emptyStateMessage}</h3>
          <p className="text-xs text-zinc-500">
            No next song in this setlist. You are at the final song!
          </p>
        </div>
      </div>
    );
  }

  const effectiveSongId = song.songId || song.id || "";
  const effectiveSlotId = song.slotId || song.id;

  return (
    <div
      className={cn(
        "flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-black relative",
        className
      )}
    >
      {/* Column Sub-Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-zinc-900/90 border-b border-white/10 shrink-0 gap-2 z-20">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300 text-[10px] font-black tracking-wider uppercase border border-violet-500/40 shrink-0">
            {songLabel}
          </span>
          <div className="truncate">
            <h2 className="text-sm md:text-base font-bold text-zinc-100 truncate" title={song.title}>
              {song.title}
            </h2>
            <div className="text-[11px] text-zinc-400 font-medium flex items-center gap-2 truncate">
              <span>{song.bpm ? `${song.bpm} BPM` : "-- BPM"}</span>
              {song.lead && (
                <span className="text-violet-300 truncate" title={`Lead: ${song.lead}`}>
                  • {song.lead}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Column Specific Tools: Key Transpose & Capo */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Key Transpose */}
          <div className="flex items-center bg-white/5 rounded-md border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => onChangeKey(-1)}
              className="p-1 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white"
              aria-label={`Lower ${songLabel} key`}
              title="Lower key half step"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center font-bold text-xs md:text-sm text-violet-300">
              {selectedKey}
            </span>
            <button
              type="button"
              onClick={() => onChangeKey(1)}
              className="p-1 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white"
              aria-label={`Raise ${songLabel} key`}
              title="Raise key half step"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {/* Guitar Capo Toggle */}
          <button
            type="button"
            onClick={onToggleGuitarMode}
            className={cn(
              "p-1.5 rounded-md transition border",
              guitarMode
                ? "bg-violet-600/20 border-violet-500/50 text-violet-400"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
            )}
            title={`Toggle Guitar Capo for ${songLabel}`}
            aria-label={`Guitar capo for ${songLabel}`}
          >
            <Guitar className="size-3.5" />
          </button>
          {guitarMode && (
            <select
              aria-label={`Capo fret for ${songLabel}`}
              value={capoFret}
              onChange={(e) => onChangeCapoFret(Number(e.target.value))}
              className="h-7 rounded-md border border-violet-500/50 bg-zinc-900 px-1 text-xs font-bold text-violet-300 outline-none"
            >
              {CAPO_FRETS.map((fret) => (
                <option key={fret} value={fret}>
                  {fret === 0 ? "Open" : `Capo ${fret}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Scrollable Chord Chart Area */}
      <div
        ref={scrollRef}
        style={{ "--user-font-scale": fontScale } as FontScaleStyle}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 py-6 pb-48 relative z-10"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <AnnotationCanvas
          songId={effectiveSongId}
          setlistId={setlistId}
          setlistSongId={effectiveSlotId}
          songTitle={song.title}
          containerRef={scrollRef}
        />

        <div className="max-w-2xl mx-auto space-y-6 relative z-10">
          {stageNotes && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/80 p-2.5 text-xs font-semibold text-amber-200 shadow-md">
              <span className="font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Musician Notes:
              </span>
              <p className="whitespace-pre-wrap">{stageNotes}</p>
            </div>
          )}

          {displayedSections.length > 0 ? (
            displayedSections.map((section, idx) => (
              <div
                key={idx}
                id={`${columnKey}-section-${idx}`}
                className="space-y-2.5 scroll-mt-6"
              >
                {section.label && section.label !== "unknown" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleLoopSection?.(idx)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider transition hover:brightness-125",
                        activeLoopIndex === idx
                          ? "bg-amber-500/30 border-amber-400 text-amber-300 ring-2 ring-amber-400/50"
                          : getSectionColorClass(section.label)
                      )}
                      title={onToggleLoopSection ? "Click to loop this section" : section.label}
                    >
                      <span>{section.label}</span>
                      {activeLoopIndex === idx && (
                        <Repeat className="size-3 text-amber-300 animate-spin" />
                      )}
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  {section.lines.map((line, lIdx) => (
                    <div
                      key={lIdx}
                      className="leading-relaxed max-w-full overflow-x-auto no-scrollbar"
                    >
                      {line.tokens ? (
                        <div className="flex flex-wrap items-end leading-none">
                          {line.tokens.map((token, tIdx) => (
                            <span key={tIdx} className="inline-flex flex-col items-start">
                              {token.chord ? (
                                onChordClick ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onChordClick(token.chord || "");
                                    }}
                                    className="font-mono font-bold text-violet-400 hover:text-violet-200 hover:underline cursor-pointer leading-none pb-1 min-h-[1em] block whitespace-pre text-[calc(0.85rem*var(--user-font-scale))]"
                                    title={`Click for ${token.chord} chord diagram`}
                                  >
                                    {token.chord}
                                  </button>
                                ) : (
                                  <span className="font-mono font-bold text-violet-400 leading-none pb-1 min-h-[1em] block whitespace-pre text-[calc(0.85rem*var(--user-font-scale))]">
                                    {token.chord}
                                  </span>
                                )
                              ) : (
                                <span className="pb-1 min-h-[1em] block font-mono text-[calc(0.85rem*var(--user-font-scale))]" />
                              )}
                              <span className="font-semibold text-zinc-100 whitespace-pre text-[calc(1.15rem*var(--user-font-scale))] md:text-[calc(1.35rem*var(--user-font-scale))]">
                                {token.lyric || (token.chord ? "\u00a0" : "")}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <>
                          {line.chords && (
                            <div className="font-mono font-bold text-violet-400 whitespace-pre leading-none text-[calc(0.95rem*var(--user-font-scale))] md:text-[calc(1.15rem*var(--user-font-scale))]">
                              {line.chords}
                            </div>
                          )}
                          {line.lyric && (
                            <div className="font-semibold text-zinc-100 whitespace-pre-wrap leading-tight mt-1 text-[calc(1.15rem*var(--user-font-scale))] md:text-[calc(1.35rem*var(--user-font-scale))]">
                              {line.lyric}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-zinc-500 italic text-sm">
              No lyrics or chords available for this song.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
