"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Video,
  Music,
  ListMusic,
  Minus,
  Plus,
  Square,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
} from "lucide-react";
import type { PracticeSetlistSong } from "@/lib/domain/practice";
import { getYouTubeVideoId, getSpotifyTrackInfo } from "@/lib/domain/practice";
import { PracticePlayer } from "@/components/practice-player";
import { PracticeMetronome } from "@/components/practice-metronome";
import { AnnotationCanvas } from "@/components/annotation-canvas";
import { ChordNotation, ChordNotationToggle } from "@/components/chord-notation-toggle";
import { chordToNashville, transposeChord } from "@/lib/domain/chords";
import { resolveArrangementSongSections } from "@/lib/domain/arrangements";
import { cn } from "@/lib/utils";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

function getSectionLabelColor(label: string) {
  const norm = label.toLowerCase();
  if (norm.includes("pre-chorus") || norm.includes("prechorus")) {
    return "bg-violet-950/60 text-violet-300 border-violet-500/30";
  }
  if (norm.includes("chorus")) {
    return "bg-blue-950/60 text-blue-300 border-blue-500/30";
  }
  if (norm.includes("bridge")) {
    return "bg-rose-950/60 text-rose-300 border-rose-500/30";
  }
  if (norm.includes("verse")) {
    return "bg-emerald-950/60 text-emerald-300 border-emerald-500/30";
  }
  if (norm.includes("intro")) {
    return "bg-amber-950/60 text-amber-300 border-amber-500/30";
  }
  if (norm.includes("outro") || norm.includes("ending")) {
    return "bg-orange-950/60 text-orange-300 border-orange-500/30";
  }
  if (norm.includes("instrumental") || norm.includes("interlude") || norm.includes("solo")) {
    return "bg-cyan-950/60 text-cyan-300 border-cyan-500/30";
  }
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

interface PracticeModeClientProps {
  setlistId: string;
  setlistName: string;
  songs: PracticeSetlistSong[];
  canEditSong: boolean;
  teamContext?: unknown;
}

export default function PracticeModeClient({
  setlistId,
  setlistName,
  songs,
  canEditSong,
}: PracticeModeClientProps) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [showQueueMobile, setShowQueueMobile] = useState(false);

  const activeSong = songs[currentSongIndex] || songs[0];
  const isFirstSong = currentSongIndex === 0;
  const isLastSong = currentSongIndex === songs.length - 1;

  // Chart settings
  const [selectedKey, setSelectedKey] = useState(activeSong?.assignedKey || activeSong?.originalKey || "C");
  const [notation, setNotation] = useState<ChordNotation>("chords");
  const showNumbers = notation === "nashville";
  const [fontScale, setFontScale] = useState(1.0);

  // Auto-scroll & playback state
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [prevSongIndex, setPrevSongIndex] = useState(currentSongIndex);

  // Reset transient autoscroll/playback states when active song changes (render-time derivation)
  if (prevSongIndex !== currentSongIndex) {
    setPrevSongIndex(currentSongIndex);
    setIsAutoScrolling(false);
    setIsPlayerPlaying(false);
  }

  const [scrollSpeed, setScrollSpeed] = useState(1.0);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);

  // DOM side-effect for chart scroll reset
  useEffect(() => {
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollTop = 0;
    }
  }, [currentSongIndex]);

  // Autoscroll animation runner
  useEffect(() => {
    if (!isAutoScrolling) {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
      return;
    }

    let lastTime: number | null = null;
    const step = (timestamp: number) => {
      if (lastTime !== null && chartScrollRef.current) {
        const delta = timestamp - lastTime;
        const pixelsPerFrame = (scrollSpeed * 30 * delta) / 1000;
        chartScrollRef.current.scrollTop += pixelsPerFrame;

        // Stop autoscroll when reaching bottom
        const { scrollTop, scrollHeight, clientHeight } = chartScrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setIsAutoScrolling(false);
          return;
        }
      }
      lastTime = timestamp;
      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimRef.current !== null) {
        cancelAnimationFrame(scrollAnimRef.current);
        scrollAnimRef.current = null;
      }
    };
  }, [isAutoScrolling, scrollSpeed]);

  // Resolve arrangement sections for active song
  const sections = useMemo(() => {
    if (!activeSong) return [];
    return resolveArrangementSongSections(
      activeSong.lyricsChords || "",
      activeSong.arrangementSections,
    );
  }, [activeSong]);

  const handleSelectSong = (index: number) => {
    setCurrentSongIndex(index);
    if (songs[index]) {
      setSelectedKey(songs[index].assignedKey || songs[index].originalKey || "C");
    }
    setShowQueueMobile(false);
  };

  const handleNextSong = useCallback(() => {
    if (currentSongIndex < songs.length - 1) {
      const nextIdx = currentSongIndex + 1;
      setCurrentSongIndex(nextIdx);
      if (songs[nextIdx]) {
        setSelectedKey(songs[nextIdx].assignedKey || songs[nextIdx].originalKey || "C");
      }
    }
  }, [currentSongIndex, songs]);

  const handlePreviousSong = useCallback(() => {
    if (currentSongIndex > 0) {
      const prevIdx = currentSongIndex - 1;
      setCurrentSongIndex(prevIdx);
      if (songs[prevIdx]) {
        setSelectedKey(songs[prevIdx].assignedKey || songs[prevIdx].originalKey || "C");
      }
    }
  }, [currentSongIndex, songs]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-900/90 px-4 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <Link
            href={`/setlists/${setlistId}`}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 transition"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Setlist</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="text-sm font-extrabold tracking-tight truncate max-w-[200px] sm:max-w-xs md:max-w-md">
            {setlistName}
            <span className="ml-2 font-mono text-xs font-semibold text-violet-400 uppercase">
              Practice Mode
            </span>
          </h1>
        </div>

        {/* Mobile Queue Toggle Button */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowQueueMobile(!showQueueMobile)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-950/60 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-900/80 min-h-[38px]"
          >
            <ListMusic className="size-4" />
            <span>Queue ({songs.length})</span>
            {showQueueMobile ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area: 3-Column Responsive Layout */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Column: Setlist Queue (Desktop Permanent / Mobile Collapsible Drawer) */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 flex w-full flex-col border-r border-white/10 bg-zinc-900/95 p-3 transition-transform lg:static lg:w-72 lg:translate-x-0 lg:bg-zinc-900/60",
            showQueueMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ListMusic className="size-4 text-violet-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Setlist Queue ({songs.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowQueueMobile(false)}
              className="rounded p-1 text-zinc-400 hover:text-white lg:hidden"
              aria-label="Close queue menu"
            >
              <ChevronUp className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pt-2 space-y-1.5 pr-1">
            {songs.map((item, idx) => {
              const isActive = idx === currentSongIndex;
              const hasYt = Boolean(getYouTubeVideoId(item.youtubeUrl));
              const hasSp = Boolean(getSpotifyTrackInfo(item.spotifyUrl));

              return (
                <button
                  key={item.slotId}
                  type="button"
                  onClick={() => handleSelectSong(idx)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg p-2.5 text-left text-xs font-semibold transition-all border min-h-[44px]",
                    isActive
                      ? "border-violet-500/60 bg-violet-950/70 text-white shadow-md"
                      : "border-white/5 bg-zinc-800/40 text-zinc-300 hover:border-white/20 hover:bg-zinc-800",
                  )}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold",
                        isActive ? "bg-violet-600 text-white" : "bg-zinc-700 text-zinc-300",
                      )}
                    >
                      {item.order}
                    </span>
                    <div className="truncate">
                      <p className="truncate font-bold text-sm leading-snug">{item.title}</p>
                      {item.lead && (
                        <p className="text-[11px] font-medium text-violet-300/80 truncate">
                          Lead: {item.lead}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-violet-300 border border-white/10">
                      {item.assignedKey}
                    </span>
                    {item.bpm && (
                      <span className="font-mono text-[10px] font-semibold text-zinc-400">
                        {item.bpm}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {hasYt && <Video className="size-3.5 text-red-500" />}
                      {hasSp && <Music className="size-3.5 text-emerald-500" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Column: Active Chord Chart with Annotation Overlay */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-zinc-950">
          {/* Chart Control Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/80 p-3 z-10">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Key Selector */}
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-white/10">
                <span className="px-1.5 font-mono text-[11px] font-bold uppercase text-zinc-400">
                  Key:
                </span>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="bg-transparent font-mono text-xs font-bold text-violet-300 focus:outline-none cursor-pointer"
                  aria-label="Transposed Key"
                >
                  <optgroup label="Major Keys">
                    {MAJOR_KEYS.map((k) => (
                      <option key={k} value={k} className="bg-zinc-900 text-white">
                        {k}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Minor Keys">
                    {MINOR_KEYS.map((k) => (
                      <option key={k} value={k} className="bg-zinc-900 text-white">
                        {k}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Notation Toggle */}
              <ChordNotationToggle
                value={notation}
                onChange={setNotation}
              />

              {/* Font Scale Controls */}
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setFontScale((prev) => Math.max(0.7, prev - 0.1))}
                  className="p-1 text-zinc-400 hover:text-white rounded"
                  aria-label="Decrease chart font size"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="font-mono text-[11px] font-bold px-1 text-zinc-300">
                  {Math.round(fontScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setFontScale((prev) => Math.min(1.6, prev + 0.1))}
                  className="p-1 text-zinc-400 hover:text-white rounded"
                  aria-label="Increase chart font size"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Autoscroll Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition border min-h-[36px]",
                  isAutoScrolling
                    ? "border-red-500/60 bg-red-950/80 text-red-200"
                    : "border-white/10 bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
                )}
              >
                {isAutoScrolling ? (
                  <>
                    <Square className="size-3.5 fill-current" /> Pause Scroll
                  </>
                ) : (
                  <>
                    <ChevronsDown className="size-3.5" /> Auto-Scroll
                  </>
                )}
              </button>

              {isAutoScrolling && (
                <select
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                  className="bg-zinc-800 border border-white/10 rounded-lg px-2 py-1 font-mono text-xs font-bold text-violet-300 focus:outline-none"
                  aria-label="Auto-scroll speed"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                  <option value={3.0}>3.0x</option>
                </select>
              )}
            </div>
          </div>

          {/* Canvas & Notes Drawing Overlay */}
          <AnnotationCanvas
            songId={activeSong.songId || activeSong.slotId}
            setlistId={setlistId}
            setlistSongId={activeSong.slotId}
            songTitle={activeSong.title}
            containerRef={chartScrollRef}
          />

          {/* Scrollable Song Chart View */}
          <div
            ref={chartScrollRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
            style={{ fontSize: `${fontScale}rem` }}
          >
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Song Title & Header Info */}
              <div className="border-b border-white/10 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">
                      {activeSong.title}
                    </h2>
                    {activeSong.lead && (
                      <p className="text-sm font-semibold text-violet-300 mt-0.5">
                        Lead Vocal: {activeSong.lead}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold uppercase px-2.5 py-1 rounded bg-violet-900/60 text-violet-200 border border-violet-500/40">
                        {selectedKey}
                      </span>
                      {activeSong.bpm && (
                        <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                          {activeSong.bpm} BPM
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sections Display */}
              {sections.length > 0 ? (
                <div className="space-y-6">
                  {sections.map((section, idx) => (
                    <div key={`${section.label}-${idx}`} className="space-y-2">
                      <span
                        className={cn(
                          "inline-block rounded-md border px-2.5 py-1 font-mono text-xs font-black uppercase tracking-wide",
                          getSectionLabelColor(section.label),
                        )}
                      >
                        {section.label}
                      </span>

                      <div className="space-y-2 pl-1">
                        {section.lines.map((line, lineIdx) => (
                          <div key={lineIdx} className="leading-relaxed">
                            {line.tokens && line.tokens.length > 0 ? (
                              <div className="flex flex-wrap items-end leading-none mb-1">
                                {line.tokens.map((token, tokenIdx) => (
                                  <span key={tokenIdx} className="inline-flex flex-col items-start">
                                    <span className="font-mono font-bold text-violet-300 text-sm leading-none pb-1 min-h-[16px] block whitespace-pre">
                                      {token.chord
                                        ? showNumbers
                                          ? chordToNashville(token.chord, activeSong.originalKey)
                                          : transposeChord(
                                              token.chord,
                                              activeSong.originalKey,
                                              selectedKey,
                                            )
                                        : ""}
                                    </span>
                                    <span className="font-semibold text-zinc-100 text-base whitespace-pre">
                                      {token.lyric || (token.chord ? "\u00a0" : "")}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="font-semibold text-zinc-200 whitespace-pre-wrap">
                                {line.lyric}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-zinc-500 font-semibold italic">
                  No lyrics or chords available for this song.
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Column: Player & Metronome Panel */}
        <aside className="w-full border-t border-white/10 bg-zinc-900/90 p-4 lg:w-96 lg:border-t-0 lg:border-l overflow-y-auto space-y-4">
          {/* Media Player */}
          <PracticePlayer
            activeSong={activeSong}
            isFirstSong={isFirstSong}
            isLastSong={isLastSong}
            onPreviousSong={handlePreviousSong}
            onNextSong={handleNextSong}
            onPlaybackStateChange={setIsPlayerPlaying}
          />

          {/* Metronome */}
          <PracticeMetronome
            activeSong={activeSong}
            setlistId={setlistId}
            canEditSong={canEditSong}
            isPlayerPlaying={isPlayerPlaying}
          />
        </aside>
      </div>
    </div>
  );
}
