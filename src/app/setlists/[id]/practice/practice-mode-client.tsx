"use client";

import { useCallback, useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Minus,
  Plus,
  Play,
  Square,
  Guitar,
  ChevronsDown,
  Video,
  Music,
  ListMusic,
  GripHorizontal,
  Maximize2,
} from "lucide-react";
import type { PracticeSetlistSong } from "@/lib/domain/practice";
import { getYouTubeVideoId, getSpotifyTrackInfo } from "@/lib/domain/practice";
import { PracticePlayer } from "@/components/practice-player";
import { PracticeMetronome } from "@/components/practice-metronome";
import { AnnotationCanvas } from "@/components/annotation-canvas";
import { ChordNotationToggle } from "@/components/chord-notation-toggle";
import {
  progressionToNashville,
  tokensToNashville,
  transposeProgression,
  transposeTokens,
} from "@/lib/domain/chords";
import { resolveArrangementSongSections } from "@/lib/domain/arrangements";
import { getEffectiveAssignedKey } from "@/lib/domain/setlists";
import { updateSetlistSongKeyAction } from "@/app/actions";
import { cn } from "@/lib/utils";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const CAPO_FRETS = Array.from({ length: 12 }, (_, fret) => fret);

function getAbbr(label: string) {
  const lbl = label.toLowerCase();
  if (lbl.includes("pre-chorus") || lbl.includes("prechorus")) return "PC";
  if (lbl.includes("verse")) return label.toUpperCase().replace("VERSE", "V").trim();
  if (lbl.includes("chorus")) return label.toUpperCase().replace("CHORUS", "C").trim();
  if (lbl.includes("bridge")) return label.toUpperCase().replace("BRIDGE", "B").trim();
  if (lbl.includes("intro")) return "INT";
  if (lbl.includes("outro")) return "OUT";
  if (lbl.includes("instrumental") || lbl.includes("interlude")) return "INS";
  return label.substring(0, 3).toUpperCase();
}

function getSectionLabelColor(label: string) {
  const norm = label.toLowerCase();
  if (norm.includes("pre-chorus") || norm.includes("prechorus")) {
    return "bg-violet-900/50 text-violet-300 border-violet-500/30";
  }
  if (norm.includes("chorus")) {
    return "bg-blue-900/50 text-blue-300 border-blue-500/30";
  }
  if (norm.includes("bridge")) {
    return "bg-rose-900/50 text-rose-300 border-rose-500/30";
  }
  if (norm.includes("verse")) {
    return "bg-emerald-900/50 text-emerald-300 border-emerald-500/30";
  }
  if (norm.includes("intro")) {
    return "bg-amber-900/50 text-amber-300 border-amber-500/30";
  }
  if (norm.includes("outro") || norm.includes("ending")) {
    return "bg-orange-900/50 text-orange-300 border-orange-500/30";
  }
  if (norm.includes("instrumental") || norm.includes("interlude") || norm.includes("solo")) {
    return "bg-cyan-900/50 text-cyan-300 border-cyan-500/30";
  }
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}

type FontScaleStyle = CSSProperties & { "--user-font-scale": number };

interface DraggableWindowProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  defaultPos: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  onFocus?: () => void;
}

function DraggableWindow({
  id,
  title,
  icon,
  defaultPos,
  onClose,
  children,
  className = "w-96 max-w-[95vw]",
  zIndex = 40,
  onFocus,
}: DraggableWindowProps) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`win_pos_${id}`);
        if (saved) return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return defaultPos;
  });

  const [isMinimized, setIsMinimized] = useState(false);
  const isDraggingRef = useRef(false);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onFocus?.();
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    isDraggingRef.current = true;
    offsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const maxX = (typeof window !== "undefined" ? window.innerWidth : 1200) - 80;
    const maxY = (typeof window !== "undefined" ? window.innerHeight : 800) - 60;
    const nextX = Math.max(10, Math.min(maxX, e.clientX - offsetRef.current.x));
    const nextY = Math.max(10, Math.min(maxY, e.clientY - offsetRef.current.y));
    const updated = { x: nextX, y: nextY };
    setPos(updated);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        localStorage.setItem(`win_pos_${id}`, JSON.stringify(pos));
      } catch {
        // ignore
      }
    }
  };

  if (isMinimized) {
    return (
      <div
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          zIndex,
        }}
        onPointerDown={onFocus}
        className="fixed z-40 flex items-center gap-2 rounded-full border border-white/20 bg-zinc-900/95 px-3 py-1.5 shadow-2xl backdrop-blur-md cursor-grab active:cursor-grabbing select-none hover:bg-zinc-800 transition"
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex items-center gap-2"
        >
          <GripHorizontal className="size-3.5 text-zinc-400" />
          {icon}
          <span className="text-xs font-bold text-zinc-200 max-w-[140px] truncate">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-1 text-zinc-400 hover:text-white rounded"
          title="Expand window"
          aria-label="Expand window"
        >
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-zinc-400 hover:text-red-400 rounded"
          title="Close window"
          aria-label="Close window"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex,
      }}
      onPointerDown={onFocus}
      className={cn(
        "fixed rounded-xl border border-white/15 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md transition-shadow select-none resize overflow-auto min-w-[280px] min-h-[140px]",
        className,
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 cursor-grab active:cursor-grabbing bg-zinc-800/40 -mx-4 -mt-4 px-4 pt-3.5 rounded-t-xl"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <GripHorizontal className="size-4 text-zinc-400 shrink-0" />
          {icon}
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 truncate">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="rounded p-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
            title="Minimize window"
            aria-label="Minimize window"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
            title="Close window"
            aria-label="Close window"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="select-text h-[calc(100%-2.5rem)] overflow-y-auto">{children}</div>
    </div>
  );
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
  const activeSong = songs[currentSongIndex] || songs[0];
  const isFirstSong = currentSongIndex === 0;
  const isLastSong = currentSongIndex === songs.length - 1;

  // Chart scroll & autoscroll refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeedState] = useState(1.0);
  const scrollSpeedRef = useRef(1.0);
  const setScrollSpeed = (val: number) => {
    setScrollSpeedState(val);
    scrollSpeedRef.current = val;
  };
  const scrollAnimationFrameRef = useRef<number | null>(null);

  // Swipe gesture state
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const minSwipeDistance = 60;
  const maxSwipeTime = 300;

  // Stage Mode Transpose, Capo, Notation, and Font Scaling
  const baseKey = activeSong?.originalKey || "C";
  const initialKey = getEffectiveAssignedKey(activeSong?.assignedKey, activeSong?.originalKey);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [guitarMode, setGuitarMode] = useState(false);
  const [capoFret, setCapoFret] = useState(0);
  const [showNumbers, setShowNumbers] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  // Practice Mode Drawer Toggles
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [showMetronomePanel, setShowMetronomePanel] = useState(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [focusedWindow, setFocusedWindow] = useState<"player" | "metronome" | "queue" | null>(null);

  // Reset transient states on active song change
  const [prevSongIndex, setPrevSongIndex] = useState(currentSongIndex);
  if (prevSongIndex !== currentSongIndex) {
    setPrevSongIndex(currentSongIndex);
    setSelectedKey(getEffectiveAssignedKey(activeSong?.assignedKey, activeSong?.originalKey));
    setGuitarMode(false);
    setCapoFret(0);
    setIsScrolling(false);
    setMetronomePlaying(false);
    setIsPlayerPlaying(false);
  }

  // Scroll reset DOM side-effect
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [currentSongIndex]);

  // Transpose Logic
  const isMinor = activeSong?.originalKey?.endsWith("m");
  const activeKeys = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const selectedKeyIndex = activeKeys.indexOf(selectedKey);

  async function changeKey(direction: number) {
    if (selectedKeyIndex === -1) return;
    let nextIdx = (selectedKeyIndex + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    const newKey = activeKeys[nextIdx];
    setSelectedKey(newKey);

    if (activeSong?.slotId) {
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("slotId", activeSong.slotId);
      formData.set("assignedKey", newKey);
      updateSetlistSongKeyAction(formData).catch(console.error);
    }
  }

  const capoData = useMemo(() => {
    if (!guitarMode) return null;
    if (selectedKeyIndex === -1) return { chordKey: selectedKey, fret: capoFret };

    const chordKeyIndex = (selectedKeyIndex - capoFret + activeKeys.length) % activeKeys.length;
    return { chordKey: activeKeys[chordKeyIndex] ?? selectedKey, fret: capoFret };
  }, [activeKeys, capoFret, guitarMode, selectedKey, selectedKeyIndex]);

  const displayKey = capoData?.chordKey ?? selectedKey;

  // Resolve arrangement sections
  const sections = useMemo(() => {
    if (!activeSong) return [];
    return resolveArrangementSongSections(
      activeSong.lyricsChords || "",
      activeSong.arrangementSections,
    );
  }, [activeSong]);

  // Transpose the text
  const transposedSections = useMemo(() => {
    return sections.map((sec) => ({
      ...sec,
      lines: sec.lines.map((line) => {
        if (line.tokens) {
          return { ...line, tokens: transposeTokens(line.tokens, baseKey, displayKey) };
        }
        if (!line.chords) return line;
        return { ...line, chords: transposeProgression(line.chords, baseKey, displayKey) };
      }),
    }));
  }, [sections, baseKey, displayKey]);

  const displayedSections = useMemo(() => {
    if (!showNumbers) return transposedSections;
    return transposedSections.map((sec) => ({
      ...sec,
      lines: sec.lines.map((line) => {
        if (line.tokens) {
          return { ...line, tokens: tokensToNashville(line.tokens, baseKey) };
        }
        if (!line.chords) return line;
        return { ...line, chords: progressionToNashville(line.chords, baseKey) };
      }),
    }));
  }, [transposedSections, showNumbers, baseKey]);

  // Auto-scroll loop
  const toggleAutoScroll = () => {
    setIsScrolling((prev) => !prev);
  };

  useEffect(() => {
    if (!isScrolling) {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
      return;
    }

    let lastTime: number | null = null;
    const step = (timestamp: number) => {
      if (lastTime !== null && scrollRef.current) {
        const delta = timestamp - lastTime;
        const pixelsPerFrame = (scrollSpeedRef.current * 30 * delta) / 1000;
        scrollRef.current.scrollTop += pixelsPerFrame;

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setIsScrolling(false);
          return;
        }
      }
      lastTime = timestamp;
      scrollAnimationFrameRef.current = requestAnimationFrame(step);
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };
  }, [isScrolling]);

  // Handle section jump
  const handleJumpToSection = (sectionIndex: number) => {
    const el = document.getElementById(`section-${sectionIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Song Queue Navigation
  const handleSelectSong = (index: number) => {
    setCurrentSongIndex(index);
    setShowQueueDrawer(false);
  };

  const handleNextSong = useCallback(() => {
    if (currentSongIndex < songs.length - 1) {
      setCurrentSongIndex(currentSongIndex + 1);
    }
  }, [currentSongIndex, songs.length]);

  const handlePreviousSong = useCallback(() => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex(currentSongIndex - 1);
    }
  }, [currentSongIndex]);

  // Touch Swipe Handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartTime(Date.now());
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const timeElapsed = Date.now() - touchStartTime;

    if (timeElapsed <= maxSwipeTime && Math.abs(distance) >= minSwipeDistance) {
      if (distance > 0 && currentSongIndex < songs.length - 1) {
        handleNextSong();
      } else if (distance < 0 && currentSongIndex > 0) {
        handlePreviousSong();
      }
    }
  };

  if (!activeSong) return null;

  return (
    <div className="fixed inset-0 h-[100dvh] bg-black text-white flex flex-col font-sans overflow-hidden transition-shadow duration-300 z-50">
      {/* Stage Top Bar - Controls */}
      <header className="flex items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-zinc-950 border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar gap-4 md:gap-8 z-30">
        {/* Left: Back Link & Title */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <Link
            href={`/setlists/${setlistId}`}
            className="p-2 rounded-full hover:bg-white/10 transition"
            title={`Return to ${setlistName}`}
          >
            <X className="size-5 md:size-6 text-zinc-400" />
          </Link>
          <div className="flex flex-col justify-center">
            <h1 className="text-base md:text-xl font-bold flex items-center gap-2">
              <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
                {activeSong.title}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300 text-[10px] md:text-xs font-black tracking-widest uppercase border border-violet-500/40 whitespace-nowrap">
                PRACTICE MODE
              </span>
              {guitarMode && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                  {capoFret === 0 ? "Open" : `Capo ${capoFret}`}
                </span>
              )}
            </h1>
            <div className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1 flex items-center gap-2">
              <span className="text-zinc-400 font-bold uppercase text-[11px] truncate max-w-[120px]">
                {setlistName}
              </span>
              <span>• {activeSong.bpm || "--"} BPM</span>
              {activeSong.lead && (
                <span className="text-violet-300 truncate max-w-[150px]">
                  Lead: {activeSong.lead}
                </span>
              )}
              {activeSong.arrangement && (
                <span
                  className="text-zinc-400 truncate max-w-[200px] hidden sm:inline"
                  title={activeSong.arrangement}
                >
                  • {activeSong.arrangement}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stage & Practice Toolbar */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          {/* Transpose */}
          <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
            <button
              type="button"
              onClick={() => changeKey(-1)}
              className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white"
              aria-label="Lower key by half step"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-12 text-center font-bold text-lg text-violet-300">
              {selectedKey}
            </span>
            <button
              type="button"
              onClick={() => changeKey(1)}
              className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white"
              aria-label="Raise key by half step"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* Chords vs Nashville Toggle */}
          <ChordNotationToggle
            value={showNumbers ? "nashville" : "chords"}
            onChange={(notation) => setShowNumbers(notation === "nashville")}
          />

          {/* Font Scaling */}
          <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setFontScale((s) => Math.max(0.6, s - 0.1))}
              className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white font-bold text-xs"
              title="Decrease Font"
            >
              A-
            </button>
            <span className="w-10 text-center font-bold text-sm">
              {Math.round(fontScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setFontScale((s) => Math.min(1.8, s + 0.1))}
              className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white font-bold text-sm"
              title="Increase Font"
            >
              A+
            </button>
          </div>

          {/* Guitar Mode (Capo) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuitarMode(!guitarMode)}
              className={cn(
                "p-3 rounded-lg transition border min-h-[44px]",
                guitarMode
                  ? "bg-violet-600/20 border-violet-500/50 text-violet-400"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-white",
              )}
              title="Guitar Mode (Capo)"
            >
              <Guitar className="size-5" />
            </button>
            {guitarMode && (
              <select
                aria-label="Capo fret"
                value={capoFret}
                onChange={(e) => setCapoFret(Number(e.target.value))}
                className="h-11 rounded-lg border border-violet-500/50 bg-zinc-900 px-3 text-sm font-bold text-violet-300 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
              >
                {CAPO_FRETS.map((fret) => (
                  <option key={fret} value={fret}>
                    {fret === 0 ? "Open" : `Capo ${fret}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Auto Scroll Speed */}
          <div
            className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1"
            title="Auto Scroll"
          >
            <button
              type="button"
              onClick={toggleAutoScroll}
              className={cn(
                "p-2 rounded transition",
                isScrolling ? "bg-violet-600/20 text-violet-400" : "text-zinc-400 hover:text-white",
              )}
              aria-label="Toggle Auto Scroll"
            >
              <ChevronsDown className="size-4" />
            </button>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.1"
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
              className="w-16 md:w-24 mx-2 accent-violet-500"
              title="Scroll Speed"
            />
          </div>

          <div className="w-px h-8 bg-white/10 mx-1" />

          {/* Practice Media Player Toggle Button */}
          <button
            type="button"
            onClick={() => setShowPlayerPanel(!showPlayerPanel)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
              showPlayerPanel || isPlayerPlaying
                ? "border-red-500/60 bg-red-950/80 text-red-200 shadow-md"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
            title="Media Player"
          >
            <Video className="size-4 text-red-400" />
            <span className="hidden sm:inline">Player</span>
          </button>

          {/* Metronome Panel Toggle Button */}
          <button
            type="button"
            onClick={() => setShowMetronomePanel(!showMetronomePanel)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
              showMetronomePanel || metronomePlaying
                ? "border-violet-500/60 bg-violet-950/80 text-violet-200 shadow-md"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
            title="Metronome Settings"
          >
            {metronomePlaying ? <Square className="size-4 text-violet-400" /> : <Play className="size-4 text-violet-400" />}
            <span className="hidden sm:inline">Metronome</span>
          </button>

          {/* Setlist Queue Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowQueueDrawer(!showQueueDrawer)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
              showQueueDrawer
                ? "border-violet-500/60 bg-violet-950/80 text-violet-200 shadow-md"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
            title="Setlist Queue"
          >
            <ListMusic className="size-4 text-violet-400" />
            <span>Queue ({songs.length})</span>
          </button>

          {/* Queue Navigation Buttons */}
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePreviousSong}
              disabled={isFirstSong}
              className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition min-h-[44px]"
              aria-label="Previous Song"
            >
              <ChevronLeft className="size-5 md:size-6" />
            </button>
            <span className="text-xs md:text-sm font-bold text-zinc-400 w-8 md:w-12 text-center font-mono">
              {currentSongIndex + 1} / {songs.length}
            </span>
            <button
              type="button"
              onClick={handleNextSong}
              disabled={isLastSong}
              className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition min-h-[44px]"
              aria-label="Next Song"
            >
              <ChevronRight className="size-5 md:size-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Arrangement Blocks (Desktop Header Bar) */}
      <div className="hidden md:flex items-center gap-2 px-6 py-2.5 bg-zinc-900 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-20">
        {displayedSections.map((section, idx) => {
          if (!section.label || section.label === "unknown") return null;
          const colorClass = getSectionLabelColor(section.label);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleJumpToSection(idx)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition hover:brightness-125",
                colorClass,
              )}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      {/* Main Container: Chart View + Mobile Jump Blocks */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Full Scrollable Stage Chord Chart Area */}
        <div
          ref={scrollRef}
          style={{ "--user-font-scale": fontScale } as FontScaleStyle}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-8 pb-64 relative z-10"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Unified Text Notes & Drawing Canvas Toolbar */}
          <AnnotationCanvas
            songId={activeSong.songId || activeSong.slotId}
            setlistId={setlistId}
            setlistSongId={activeSong.slotId}
            songTitle={activeSong.title}
            containerRef={scrollRef}
          />

          <div className="max-w-4xl mx-auto space-y-8 relative z-10">
            {/* Song Sections Display */}
            {displayedSections.length > 0 ? (
              displayedSections.map((section, idx) => (
                <div key={idx} id={`section-${idx}`} className="space-y-3 scroll-mt-6">
                  {section.label && section.label !== "unknown" && (
                    <div
                      className={cn(
                        "inline-block rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider",
                        getSectionLabelColor(section.label),
                      )}
                    >
                      {section.label}
                    </div>
                  )}
                  <div className="space-y-4">
                    {section.lines.map((line, lIdx) => (
                      <div
                        key={lIdx}
                        className="leading-relaxed max-w-full overflow-x-auto no-scrollbar"
                      >
                        {line.tokens ? (
                          // Syllable-aligned ChordPro format
                          <div className="flex flex-wrap items-end leading-none">
                            {line.tokens.map((token, tIdx) => (
                              <span key={tIdx} className="inline-flex flex-col items-start">
                                <span className="font-mono font-bold text-violet-400 leading-none pb-1 min-h-[1em] block whitespace-pre text-[calc(0.85rem*var(--user-font-scale))]">
                                  {token.chord || ""}
                                </span>
                                <span className="font-semibold text-zinc-100 whitespace-pre text-[calc(1.25rem*var(--user-font-scale))] md:text-[calc(1.5rem*var(--user-font-scale))]">
                                  {token.lyric || (token.chord ? "\u00a0" : "")}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          // Space-aligned format fallback
                          <>
                            {line.chords && (
                              <div className="font-mono font-bold text-violet-400 whitespace-pre leading-none text-[calc(1rem*var(--user-font-scale))] md:text-[calc(1.25rem*var(--user-font-scale))]">
                                {line.chords}
                              </div>
                            )}
                            {line.lyric && (
                              <div className="font-semibold text-zinc-100 whitespace-pre-wrap leading-tight mt-1 text-[calc(1.25rem*var(--user-font-scale))] md:text-[calc(1.5rem*var(--user-font-scale))]">
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
              <div className="p-12 text-center text-zinc-500 italic font-semibold">
                No lyrics or chords found for this song.
              </div>
            )}
          </div>
        </div>

        {/* Mobile Right Side Arrangement Jump Blocks */}
        <div className="md:hidden flex flex-col items-center gap-3 py-4 w-16 bg-zinc-900 border-l border-white/5 overflow-y-auto shrink-0 z-20">
          {displayedSections.map((section, idx) => {
            if (!section.label || section.label === "unknown") return null;
            const colorClass = getSectionLabelColor(section.label);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleJumpToSection(idx)}
                className={cn(
                  "w-12 py-3 rounded-lg text-xs font-black uppercase tracking-tighter border transition hover:brightness-125 shadow-md",
                  colorClass,
                )}
                title={section.label}
              >
                {getAbbr(section.label)}
              </button>
            );
          })}
        </div>
      </div>

      {/* FLOATING PRACTICE PANELS (Freely Draggable Windowed Panels) */}

      {/* 1. Freely Draggable Media Player Window */}
      {showPlayerPanel && (
        <DraggableWindow
          id="player"
          title={`Media Player (${activeSong.title})`}
          icon={<Video className="size-4 text-red-400 shrink-0" />}
          defaultPos={{ x: typeof window !== "undefined" ? Math.max(20, window.innerWidth - 420) : 700, y: 80 }}
          onClose={() => setShowPlayerPanel(false)}
          zIndex={focusedWindow === "player" ? 50 : 40}
          onFocus={() => setFocusedWindow("player")}
        >
          <PracticePlayer
            activeSong={activeSong}
            isFirstSong={isFirstSong}
            isLastSong={isLastSong}
            onPreviousSong={handlePreviousSong}
            onNextSong={handleNextSong}
            onPlaybackStateChange={setIsPlayerPlaying}
          />
        </DraggableWindow>
      )}

      {/* 2. Freely Draggable Metronome Engine Window */}
      {showMetronomePanel && (
        <DraggableWindow
          id="metronome"
          title="Metronome Engine"
          icon={<Square className="size-4 text-violet-400 shrink-0" />}
          defaultPos={{ x: typeof window !== "undefined" ? Math.max(20, window.innerWidth - 840) : 280, y: 80 }}
          onClose={() => setShowMetronomePanel(false)}
          zIndex={focusedWindow === "metronome" ? 50 : 40}
          onFocus={() => setFocusedWindow("metronome")}
        >
          <PracticeMetronome
            activeSong={activeSong}
            setlistId={setlistId}
            canEditSong={canEditSong}
            isPlayerPlaying={isPlayerPlaying}
          />
        </DraggableWindow>
      )}

      {/* 3. Freely Draggable Setlist Queue Window */}
      {showQueueDrawer && (
        <DraggableWindow
          id="queue"
          title={`Setlist Queue (${songs.length})`}
          icon={<ListMusic className="size-4 text-violet-400 shrink-0" />}
          defaultPos={{ x: 20, y: 80 }}
          onClose={() => setShowQueueDrawer(false)}
          className="w-80 max-w-[90vw]"
          zIndex={focusedWindow === "queue" ? 50 : 40}
          onFocus={() => setFocusedWindow("queue")}
        >
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {songs.map((item, idx) => {
              const isActive = idx === currentSongIndex;
              const itemYt = Boolean(getYouTubeVideoId(item.youtubeUrl));
              const itemSp = Boolean(getSpotifyTrackInfo(item.spotifyUrl));

              return (
                <button
                  key={item.slotId}
                  type="button"
                  onClick={() => handleSelectSong(idx)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg p-3 text-left text-xs font-semibold transition border min-h-[44px]",
                    isActive
                      ? "border-violet-500/60 bg-violet-950/80 text-white shadow-md"
                      : "border-white/5 bg-zinc-800/50 text-zinc-300 hover:border-white/20 hover:bg-zinc-800",
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
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

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] font-extrabold text-violet-300 border border-white/10">
                      {item.assignedKey}
                    </span>
                    <div className="flex items-center gap-1">
                      {itemYt && <Video className="size-3.5 text-red-500" />}
                      {itemSp && <Music className="size-3.5 text-emerald-500" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DraggableWindow>
      )}

      {/* Floating Auto-Scroll Status Banner */}
      <div className="absolute bottom-8 right-8 pointer-events-none z-30">
        <div
          className={cn(
            "px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-opacity duration-500",
            isScrolling ? "opacity-100 bg-violet-600/80 text-white shadow-lg" : "opacity-0",
          )}
        >
          Auto-Scrolling
        </div>
      </div>
    </div>
  );
}
