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
  Columns,
  Columns2,
  Repeat,
  Mic,
} from "lucide-react";
import type { PracticeSetlistSong } from "@/lib/domain/practice";
import { getYouTubeVideoId, getSpotifyTrackInfo } from "@/lib/domain/practice";
import { PracticePlayer } from "@/components/practice-player";
import { PracticeMetronome } from "@/components/practice-metronome";
import { AnnotationCanvas } from "@/components/annotation-canvas";
import { ChordNotationToggle } from "@/components/chord-notation-toggle";
import { ChordDiagram } from "@/components/chord-diagram";
import { PracticeChecklist } from "@/components/practice-checklist";
import { PracticeSessionTimer } from "@/components/practice-session-timer";
import {
  evaluateVocalRange,
  getSongConfidence,
  type ReadinessRating,
} from "@/lib/domain/practice-features";
import {
  progressionToNashville,
  tokensToNashville,
  transposeProgression,
  transposeTokens,
} from "@/lib/domain/chords";
import { resolveArrangementSongSections } from "@/lib/domain/arrangements";
import { getEffectiveAssignedKey } from "@/lib/domain/setlists";
import { updateSetlistSongKeyAction } from "@/app/actions";
import { ArrangementFlankSidebar, getSectionColorClass, getSectionAbbr } from "@/components/arrangement-flank-sidebar";
import { DoubleViewChordColumn } from "@/components/double-view-chord-column";
import { cn } from "@/lib/utils";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const CAPO_FRETS = Array.from({ length: 12 }, (_, fret) => fret);

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
  const hasMovedRef = useRef(false);
  const startPointerPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posRef = useRef(pos);

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onFocus?.();
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;

    if (e.pointerType === "touch" || e.pointerType === "pen") {
      e.preventDefault();
    }

    posRef.current = pos;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startPointerPosRef.current = { x: e.clientX, y: e.clientY };
    offsetRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    };

    const cleanup = () => {
      isDraggingRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("mouseup", handlePointerUp);
    };

    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingRef.current) return;

      const dx = Math.abs(moveEv.clientX - startPointerPosRef.current.x);
      const dy = Math.abs(moveEv.clientY - startPointerPosRef.current.y);
      if (dx > 4 || dy > 4) {
        hasMovedRef.current = true;
      }

      const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800;
      const maxX = Math.max(10, windowWidth - 60);
      const maxY = Math.max(10, windowHeight - 60);

      const nextX = Math.max(10, Math.min(maxX, moveEv.clientX - offsetRef.current.x));
      const nextY = Math.max(10, Math.min(maxY, moveEv.clientY - offsetRef.current.y));

      posRef.current = { x: nextX, y: nextY };

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        if (nodeRef.current) {
          nodeRef.current.style.left = `${nextX}px`;
          nodeRef.current.style.top = `${nextY}px`;
        }
      });
    };

    const handlePointerUp = () => {
      cleanup();

      const finalPos = posRef.current;
      setPos(finalPos);
      try {
        localStorage.setItem(`win_pos_${id}`, JSON.stringify(finalPos));
      } catch {
        // ignore
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("mouseup", handlePointerUp);
  };

  if (isMinimized) {
    return (
      <div
        ref={nodeRef}
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: "3.5rem",
          height: "3.5rem",
          maxWidth: "3.5rem",
          maxHeight: "3.5rem",
          zIndex,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onClick={() => {
          if (!hasMovedRef.current) {
            setIsMinimized(false);
          }
        }}
        className="fixed z-40 flex size-14 items-center justify-center rounded-full border border-white/30 bg-zinc-900/95 shadow-2xl backdrop-blur-md cursor-grab active:cursor-grabbing select-none hover:scale-110 hover:border-violet-400 transition group touch-none"
        title={`Click to expand ${title} (drag to move)`}
      >
        <div className="relative flex items-center justify-center pointer-events-none">
          {icon}
          <div className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-violet-600 text-[9px] font-black text-white ring-2 ring-zinc-900 shadow">
            <Maximize2 className="size-2.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={nodeRef}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex,
        touchAction: "none",
      }}
      onPointerDown={onFocus}
      className={cn(
        "fixed rounded-xl border border-white/15 bg-zinc-900/95 p-3 sm:p-3.5 shadow-2xl backdrop-blur-md transition-shadow select-none resize overflow-auto min-w-[220px] min-h-[120px] flex flex-col touch-none",
        className,
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between pb-2 border-b border-white/10 mb-2 cursor-grab active:cursor-grabbing bg-zinc-800/40 -mx-3 -mt-3 sm:-mx-3.5 sm:-mt-3.5 px-3 pt-2.5 rounded-t-xl shrink-0 touch-none select-none"
      >
        <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
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

      <div className="select-text flex-1 w-full h-full min-h-0 overflow-auto flex flex-col">{children}</div>
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
  const scrollRef2 = useRef<HTMLDivElement>(null);
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

  // Song 1 Transpose, Capo, Notation, and Font Scaling
  const baseKey = activeSong?.originalKey || "C";
  const initialKey = getEffectiveAssignedKey(activeSong?.assignedKey, activeSong?.originalKey);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [guitarMode, setGuitarMode] = useState(false);
  const [capoFret, setCapoFret] = useState(0);

  // Song 2 for Double View
  const secondSongIndex = currentSongIndex + 1 < songs.length ? currentSongIndex + 1 : null;
  const secondSong = secondSongIndex !== null ? songs[secondSongIndex] : null;
  const baseKey2 = secondSong?.originalKey || "C";
  const initialKey2 = getEffectiveAssignedKey(secondSong?.assignedKey, secondSong?.originalKey);
  const [selectedKey2, setSelectedKey2] = useState(initialKey2);
  const [guitarMode2, setGuitarMode2] = useState(false);
  const [capoFret2, setCapoFret2] = useState(0);
  const [loopSectionIndex2, setLoopSectionIndex2] = useState<number | null>(null);

  const [showNumbers, setShowNumbers] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  // Practice Mode Drawer & Feature Toggles
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [showMetronomePanel, setShowMetronomePanel] = useState(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [focusedWindow, setFocusedWindow] = useState<"player" | "metronome" | "queue" | null>(null);

  // Advanced Feature States
  const [activeChordDiagram, setActiveChordDiagram] = useState<string | null>(null);
  const [isDoubleView, setIsDoubleView] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(`practice_double_view_${setlistId}`) === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  const toggleDoubleView = () => {
    setIsDoubleView((prev) => {
      const next = !prev;
      if (next) setIsSplitView(false);
      try {
        localStorage.setItem(`practice_double_view_${setlistId}`, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [isSplitView, setIsSplitView] = useState(false);
  const toggleSplitView = () => {
    setIsSplitView((prev) => {
      const next = !prev;
      if (next) setIsDoubleView(false);
      return next;
    });
  };

  const [loopSectionIndex, setLoopSectionIndex] = useState<number | null>(null);
  const [showVoiceCues, setShowVoiceCues] = useState(false);
  const [readinessRating, setReadinessRating] = useState<ReadinessRating | null>(() =>
    activeSong ? getSongConfidence(setlistId, activeSong.slotId) : null,
  );

  // Reset transient states on active song change
  const [prevSongIndex, setPrevSongIndex] = useState(currentSongIndex);
  if (prevSongIndex !== currentSongIndex) {
    setPrevSongIndex(currentSongIndex);
    setSelectedKey(getEffectiveAssignedKey(activeSong?.assignedKey, activeSong?.originalKey));
    setGuitarMode(false);
    setCapoFret(0);
    setSelectedKey2(getEffectiveAssignedKey(secondSong?.assignedKey, secondSong?.originalKey));
    setGuitarMode2(false);
    setCapoFret2(0);
    setIsScrolling(false);
    setMetronomePlaying(false);
    setIsPlayerPlaying(false);
    setLoopSectionIndex(null);
    setLoopSectionIndex2(null);
    if (activeSong) {
      setReadinessRating(getSongConfidence(setlistId, activeSong.slotId));
    }
  }

  const vocalRange = useMemo(
    () => evaluateVocalRange(selectedKey),
    [selectedKey],
  );

  // Scroll reset DOM side-effect
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    if (scrollRef2.current) {
      scrollRef2.current.scrollTop = 0;
    }
  }, [currentSongIndex]);

  // Transpose Logic for Song 1
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

  // Transpose Logic for Song 2
  const isMinor2 = secondSong?.originalKey?.endsWith("m");
  const activeKeys2 = isMinor2 ? MINOR_KEYS : MAJOR_KEYS;
  const selectedKeyIndex2 = activeKeys2.indexOf(selectedKey2);

  async function changeKey2(direction: number) {
    if (selectedKeyIndex2 === -1) return;
    let nextIdx = (selectedKeyIndex2 + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    const newKey = activeKeys2[nextIdx];
    setSelectedKey2(newKey);

    if (secondSong?.slotId) {
      const formData = new FormData();
      formData.set("setlistId", setlistId);
      formData.set("slotId", secondSong.slotId);
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

  const capoData2 = useMemo(() => {
    if (!guitarMode2) return null;
    if (selectedKeyIndex2 === -1) return { chordKey: selectedKey2, fret: capoFret2 };

    const chordKeyIndex = (selectedKeyIndex2 - capoFret2 + activeKeys2.length) % activeKeys2.length;
    return { chordKey: activeKeys2[chordKeyIndex] ?? selectedKey2, fret: capoFret2 };
  }, [activeKeys2, capoFret2, guitarMode2, selectedKey2, selectedKeyIndex2]);

  const displayKey2 = capoData2?.chordKey ?? selectedKey2;

  // Resolve arrangement sections for Song 1
  const sections = useMemo(() => {
    if (!activeSong) return [];
    return resolveArrangementSongSections(
      activeSong.lyricsChords || "",
      activeSong.arrangementSections,
    );
  }, [activeSong]);

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

  // Resolve arrangement sections for Song 2
  const sections2 = useMemo(() => {
    if (!secondSong) return [];
    return resolveArrangementSongSections(
      secondSong.lyricsChords || "",
      secondSong.arrangementSections,
    );
  }, [secondSong]);

  const transposedSections2 = useMemo(() => {
    return sections2.map((sec) => ({
      ...sec,
      lines: sec.lines.map((line) => {
        if (line.tokens) {
          return { ...line, tokens: transposeTokens(line.tokens, baseKey2, displayKey2) };
        }
        if (!line.chords) return line;
        return { ...line, chords: transposeProgression(line.chords, baseKey2, displayKey2) };
      }),
    }));
  }, [sections2, baseKey2, displayKey2]);

  const displayedSections2 = useMemo(() => {
    if (!showNumbers) return transposedSections2;
    return transposedSections2.map((sec) => ({
      ...sec,
      lines: sec.lines.map((line) => {
        if (line.tokens) {
          return { ...line, tokens: tokensToNashville(line.tokens, baseKey2) };
        }
        if (!line.chords) return line;
        return { ...line, chords: progressionToNashville(line.chords, baseKey2) };
      }),
    }));
  }, [transposedSections2, showNumbers, baseKey2]);

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
      if (lastTime !== null) {
        const delta = timestamp - lastTime;
        const pixelsPerFrame = (scrollSpeedRef.current * 30 * delta) / 1000;
        
        if (scrollRef.current) {
          scrollRef.current.scrollTop += pixelsPerFrame;
        }
        if (isDoubleView && scrollRef2.current) {
          scrollRef2.current.scrollTop += pixelsPerFrame;
        }

        if (scrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          if (scrollTop + clientHeight >= scrollHeight - 2) {
            setIsScrolling(false);
            return;
          }
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
  }, [isDoubleView, isScrolling]);

  // Handle section jump
  const handleJumpToSection = (sectionIndex: number, targetColumn?: "song1" | "song2") => {
    if (isDoubleView) {
      const targetId = targetColumn === "song2" ? `song2-section-${sectionIndex}` : `song1-section-${sectionIndex}`;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      const el = document.getElementById(`section-${sectionIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
                {isDoubleView && secondSong
                  ? `${activeSong.title} & ${secondSong.title}`
                  : activeSong.title}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300 text-[10px] md:text-xs font-black tracking-widest uppercase border border-violet-500/40 whitespace-nowrap">
                {isDoubleView ? "DOUBLE VIEW" : "PRACTICE MODE"}
              </span>
              {!isDoubleView && guitarMode && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                  {capoFret === 0 ? "Open" : `Capo ${capoFret}`}
                </span>
              )}
              {readinessRating && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap",
                    readinessRating === "READY"
                      ? "bg-emerald-950/80 border-emerald-500 text-emerald-300"
                      : readinessRating === "GETTING_THERE"
                        ? "bg-amber-950/80 border-amber-500 text-amber-300"
                        : "bg-red-950/80 border-red-500 text-red-300",
                  )}
                  title="Song Service Readiness Rating"
                >
                  {readinessRating === "READY"
                    ? "🟢 Ready"
                    : readinessRating === "GETTING_THERE"
                      ? "🟡 Almost Ready"
                      : "🔴 Needs Work"}
                </span>
              )}
            </h1>
            <div className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-zinc-400 font-bold uppercase text-[11px] truncate max-w-[120px]">
                {setlistName}
              </span>
              <span>• {activeSong.bpm || "--"} BPM</span>
              {activeSong.lead && !isDoubleView && (
                <span className="text-violet-300 truncate max-w-[150px]">
                  Lead: {activeSong.lead}
                </span>
              )}
              {vocalRange.status !== "COMFORTABLE" && (
                <span
                  className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30"
                  title={vocalRange.recommendation}
                >
                  {vocalRange.status === "HIGH" ? "⚠️ High Key" : "ℹ️ Low Key"}
                </span>
              )}
              {activeSong.arrangement && !isDoubleView && (
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
          {/* Practice Session Timer */}
          <PracticeSessionTimer
            setlistId={setlistId}
            activeSongSlotId={activeSong.slotId}
            activeSongTitle={activeSong.title}
          />

          {/* Double View Toggle */}
          <button
            type="button"
            onClick={toggleDoubleView}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
              isDoubleView
                ? "border-violet-500 bg-violet-950/80 text-violet-200 shadow-md ring-1 ring-violet-500/50"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
            title="Toggle Double View (Side-by-Side 2 Songs on Landscape)"
            aria-label="Toggle Double View"
          >
            <Columns2 className="size-4 text-violet-400" />
            <span className="hidden sm:inline">Double View</span>
          </button>

          {/* Single View Transpose */}
          {!isDoubleView && (
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
          )}

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

          {/* Single View Guitar Mode (Capo) */}
          {!isDoubleView && (
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
          )}

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

          {/* Split View Toggle (Goals checklist) */}
          {!isDoubleView && (
            <button
              type="button"
              onClick={toggleSplitView}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
                isSplitView
                  ? "border-emerald-500/60 bg-emerald-950/80 text-emerald-200 shadow-md"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
              )}
              title="Split-Screen Layout (Chords + Goals Checklist)"
            >
              <Columns className="size-4 text-emerald-400" />
              <span className="hidden sm:inline">Split View</span>
            </button>
          )}

          {/* Voice Cues Toggle */}
          <button
            type="button"
            onClick={() => setShowVoiceCues(!showVoiceCues)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border min-h-[44px]",
              showVoiceCues
                ? "border-amber-500/60 bg-amber-950/80 text-amber-200 shadow-md"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
            )}
            title="Voice Cues (Section Countdown Overlay)"
          >
            <Mic className="size-4 text-amber-400" />
            <span className="hidden sm:inline font-mono">Cues</span>
          </button>

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
            <span className="text-xs md:text-sm font-bold text-zinc-400 w-10 md:w-16 text-center font-mono">
              {isDoubleView && secondSong
                ? `${currentSongIndex + 1}-${currentSongIndex + 2}/${songs.length}`
                : `${currentSongIndex + 1}/${songs.length}`}
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

      {/* Arrangement Blocks (Desktop Single View Header Bar) */}
      {!isDoubleView && (
        <div className="hidden md:flex items-center gap-2 px-6 py-2.5 bg-zinc-900 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-20">
          {displayedSections.map((section, idx) => {
            if (!section.label || section.label === "unknown") return null;
            const colorClass = getSectionColorClass(section.label);
            const isLooping = loopSectionIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setLoopSectionIndex(isLooping ? null : idx);
                  handleJumpToSection(idx);
                }}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition flex items-center gap-1.5",
                  isLooping
                    ? "bg-amber-500/30 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg"
                    : colorClass,
                )}
                title={isLooping ? "Loop Active – Click to Stop" : "Click to Jump & Loop Section"}
              >
                <span>{section.label}</span>
                {isLooping && <Repeat className="size-3 text-amber-300 animate-spin" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Voice Cue Section Overlay Banner */}
      {showVoiceCues && displayedSections.length > 0 && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-4 py-2 text-center text-xs font-bold text-amber-200 flex items-center justify-center gap-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
          <Mic className="size-4 text-amber-400 animate-bounce" />
          <span>Active Cue:</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-300 uppercase tracking-widest font-mono">
            {displayedSections[loopSectionIndex ?? 0]?.label || "Verse 1"}
          </span>
          <span className="text-zinc-400 font-normal">
            (Next section transition coming up)
          </span>
        </div>
      )}

      {/* Main Container Area */}
      {isDoubleView ? (
        /* DOUBLE VIEW: Left Flank | Song 1 Column | Song 2 Column | Right Flank */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Flank Sidebar: Song 1 Sections */}
          <ArrangementFlankSidebar
            side="left"
            songNumberLabel="Song 1"
            songTitle={activeSong.title}
            sections={displayedSections}
            activeLoopIndex={loopSectionIndex}
            onJumpToSection={(idx) => handleJumpToSection(idx, "song1")}
            onToggleLoopSection={(idx) => setLoopSectionIndex(loopSectionIndex === idx ? null : idx)}
          />

          {/* Center Left: Song 1 Chord Chart */}
          <DoubleViewChordColumn
            columnKey="song1"
            songLabel="Song 1"
            song={activeSong}
            selectedKey={selectedKey}
            onChangeKey={changeKey}
            guitarMode={guitarMode}
            onToggleGuitarMode={() => setGuitarMode(!guitarMode)}
            capoFret={capoFret}
            onChangeCapoFret={setCapoFret}
            fontScale={fontScale}
            displayedSections={displayedSections}
            scrollRef={scrollRef}
            setlistId={setlistId}
            activeLoopIndex={loopSectionIndex}
            onToggleLoopSection={(idx) => setLoopSectionIndex(loopSectionIndex === idx ? null : idx)}
            onChordClick={(chord) => setActiveChordDiagram(chord)}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="border-r border-white/10"
          />

          {/* Center Right: Song 2 Chord Chart */}
          <DoubleViewChordColumn
            columnKey="song2"
            songLabel="Song 2"
            song={secondSong || null}
            selectedKey={selectedKey2}
            onChangeKey={changeKey2}
            guitarMode={guitarMode2}
            onToggleGuitarMode={() => setGuitarMode2(!guitarMode2)}
            capoFret={capoFret2}
            onChangeCapoFret={setCapoFret2}
            fontScale={fontScale}
            displayedSections={displayedSections2}
            scrollRef={scrollRef2}
            setlistId={setlistId}
            activeLoopIndex={loopSectionIndex2}
            onToggleLoopSection={(idx) => setLoopSectionIndex2(loopSectionIndex2 === idx ? null : idx)}
            onChordClick={(chord) => setActiveChordDiagram(chord)}
            emptyStateMessage="End of Setlist"
          />

          {/* Right Flank Sidebar: Song 2 Sections */}
          <ArrangementFlankSidebar
            side="right"
            songNumberLabel="Song 2"
            songTitle={secondSong?.title || "End"}
            sections={displayedSections2}
            activeLoopIndex={loopSectionIndex2}
            onJumpToSection={(idx) => handleJumpToSection(idx, "song2")}
            onToggleLoopSection={(idx) => setLoopSectionIndex2(loopSectionIndex2 === idx ? null : idx)}
          />
        </div>
      ) : (
        /* SINGLE VIEW: Original Chart View + Split View Goals Panel */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Full Scrollable Stage Chord Chart Area */}
          <div
            ref={scrollRef}
            style={{ "--user-font-scale": fontScale } as FontScaleStyle}
            className={cn(
              "overflow-y-auto overflow-x-hidden px-4 md:px-8 py-8 pb-64 relative z-10 transition-all duration-300",
              isSplitView ? "w-full md:w-3/5 border-r border-white/10" : "flex-1 w-full",
            )}
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
                      <button
                        type="button"
                        onClick={() => {
                          setLoopSectionIndex(loopSectionIndex === idx ? null : idx);
                          handleJumpToSection(idx);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider transition hover:brightness-125",
                          loopSectionIndex === idx
                            ? "bg-amber-500/30 border-amber-400 text-amber-300 ring-2 ring-amber-400/50"
                            : getSectionColorClass(section.label),
                        )}
                        title="Click to loop this section"
                      >
                        <span>{section.label}</span>
                        {loopSectionIndex === idx && (
                          <Repeat className="size-3 text-amber-300 animate-spin" />
                        )}
                      </button>
                    )}
                    <div className="space-y-4">
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
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveChordDiagram(token.chord || null);
                                      }}
                                      className="font-mono font-bold text-violet-400 hover:text-violet-200 hover:underline cursor-pointer leading-none pb-1 min-h-[1em] block whitespace-pre text-[calc(0.85rem*var(--user-font-scale))]"
                                      title={`Click for ${token.chord} guitar chord diagram`}
                                    >
                                      {token.chord}
                                    </button>
                                  ) : (
                                    <span className="pb-1 min-h-[1em] block font-mono text-[calc(0.85rem*var(--user-font-scale))]" />
                                  )}
                                  <span className="font-semibold text-zinc-100 whitespace-pre text-[calc(1.25rem*var(--user-font-scale))] md:text-[calc(1.5rem*var(--user-font-scale))]">
                                    {token.lyric || (token.chord ? "\u00a0" : "")}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : (
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

          {/* Split View Right Side Panel: Goals & Readiness Checklist */}
          {isSplitView && (
            <div className="hidden md:flex flex-col w-2/5 p-4 bg-zinc-950 border-l border-white/10 overflow-y-auto no-scrollbar z-20 animate-in fade-in slide-in-from-right-4 duration-300">
              <PracticeChecklist
                setlistId={setlistId}
                songSlotId={activeSong.slotId}
                songTitle={activeSong.title}
                onRatingChange={(newRating) => setReadinessRating(newRating)}
              />
            </div>
          )}

          {/* Mobile Right Side Arrangement Jump Blocks */}
          <div className="md:hidden flex flex-col items-center gap-3 py-4 w-16 bg-zinc-900 border-l border-white/5 overflow-y-auto shrink-0 z-20">
            {displayedSections.map((section, idx) => {
              if (!section.label || section.label === "unknown") return null;
              const colorClass = getSectionColorClass(section.label);
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
                  {getSectionAbbr(section.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Interactive Guitar Chord Diagram Popover Modal */}
      {activeChordDiagram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150"
          onClick={() => setActiveChordDiagram(null)}
        >
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveChordDiagram(null)}
              className="absolute -top-3 -right-3 z-10 size-7 rounded-full bg-zinc-800 border border-white/20 text-white flex items-center justify-center font-bold text-xs hover:bg-zinc-700 shadow-md"
              title="Close Diagram"
            >
              ✕
            </button>
            <ChordDiagram chordName={activeChordDiagram} />
          </div>
        </div>
      )}
    </div>
  );
}
