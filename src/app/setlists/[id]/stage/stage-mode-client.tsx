"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Minus,
  Plus,
  Play,
  Square,
  Radio,
  Guitar,
  ChevronsDown,
  Columns2,
} from "lucide-react";
import {
  progressionToNashville,
  tokensToNashville,
  transposeProgression,
  transposeTokens,
} from "@/lib/domain/chords";
import { ChordNotationToggle } from "@/components/chord-notation-toggle";
import {
  resolveArrangementSongSections,
  type ArrangementSection,
} from "@/lib/domain/arrangements";
import { cn } from "@/lib/utils";
import { createOptionalClient } from "@/lib/supabase/client";
import { updateSetlistSongKeyAction } from "@/app/actions";
import { getAnnotationStorageKey } from "@/lib/domain/annotations";
import { AnnotationCanvas } from "@/components/annotation-canvas";
import { ArrangementFlankSidebar, getSectionColorClass, getSectionAbbr } from "@/components/arrangement-flank-sidebar";
import { DoubleViewChordColumn } from "@/components/double-view-chord-column";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const CAPO_FRETS = Array.from({ length: 12 }, (_, fret) => fret);

let audioCtx: AudioContext | null = null;
function playClick(beat: number, volume: number = 0.5) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (beat === 1) osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    else osc.frequency.setValueAtTime(700, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio error:", e);
  }
}

export type StageSetlist = {
  id: string;
  date: string;
  type: string;
  songs: Array<{
    id: string;
    order: number | null;
    assignedKey: string | null;
    lead: string;
    youtubeUrl: string | null;
    arrangement: string | null;
    arrangementSections: ArrangementSection[] | null;
    song: {
      id: string | undefined;
      title: string;
      bpm: number;
      originalKey: string;
      lyricsChords: string;
    };
  }>;
};

type FontScaleStyle = CSSProperties & { "--user-font-scale": number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function StageModeClient({ setlist }: { setlist: StageSetlist }) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isDoubleView, setIsDoubleView] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(`stage_double_view_${setlist.id}`) === "true";
      }
    } catch {
      // ignore
    }
    return false;
  });

  const toggleDoubleView = () => {
    setIsDoubleView((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`stage_double_view_${setlist.id}`, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Scroll refs for Song 1 and Song 2
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

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const minSwipeDistance = 60;
  const maxSwipeTime = 300;

  // --- Song 1 (Primary / Left Song) ---
  const currentSetlistSong = setlist.songs[currentSongIndex];
  const currentSong = currentSetlistSong?.song;
  const rawLyrics = currentSong?.lyricsChords || "";
  const sections = resolveArrangementSongSections(
    rawLyrics,
    currentSetlistSong?.arrangementSections,
  );

  const baseKey = currentSong?.originalKey || "C";
  const initialKey = currentSetlistSong?.assignedKey || currentSong?.originalKey || "C";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [guitarMode, setGuitarMode] = useState(false);
  const [capoFret, setCapoFret] = useState(0);

  // --- Song 2 (Secondary / Right Song for Double View) ---
  const secondSongIndex = currentSongIndex + 1 < setlist.songs.length ? currentSongIndex + 1 : null;
  const secondSetlistSong = secondSongIndex !== null ? setlist.songs[secondSongIndex] : null;
  const secondSong = secondSetlistSong?.song;
  const rawLyrics2 = secondSong?.lyricsChords || "";
  const sections2 = resolveArrangementSongSections(
    rawLyrics2,
    secondSetlistSong?.arrangementSections,
  );

  const baseKey2 = secondSong?.originalKey || "C";
  const initialKey2 = secondSetlistSong?.assignedKey || secondSong?.originalKey || "C";
  const [selectedKey2, setSelectedKey2] = useState(initialKey2);
  const [guitarMode2, setGuitarMode2] = useState(false);
  const [capoFret2, setCapoFret2] = useState(0);

  const [showNumbers, setShowNumbers] = useState(false);
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [fontScale, setFontScale] = useState(1);

  // --- Phase 4: Band Leader Sync ---
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const supabase = useMemo(() => createOptionalClient(), []);
  const channel = useRef<RealtimeChannel | null>(null);

  // Broadcast to others when the leader changes song.
  const setSyncedSongIndex = useCallback((updater: number | ((index: number) => number)) => {
    setCurrentSongIndex((previous) => {
      const nextIndex = typeof updater === "function" ? updater(previous) : updater;
      if (isBroadcasting) {
        channel.current?.send({
          type: "broadcast",
          event: "sync_song",
          payload: { index: nextIndex },
        });
      }
      return nextIndex;
    });
  }, [isBroadcasting]);

  useEffect(() => {
    if (!supabase) return;

    channel.current = supabase.channel(`setlist_${setlist.id}`)
      .on("broadcast", { event: "sync_song" }, (event: { payload?: unknown }) => {
        if (!isBroadcasting && isRecord(event.payload) && typeof event.payload.index === "number") {
          setSyncedSongIndex(event.payload.index);
        }
      })
      .on("broadcast", { event: "sync_section" }, (event: { payload?: unknown }) => {
        if (!isBroadcasting && isRecord(event.payload) && typeof event.payload.sectionIndex === "number") {
          const prefix = event.payload.columnKey ? `${event.payload.columnKey}-` : "";
          const el = document.getElementById(`${prefix}section-${event.payload.sectionIndex}`) || document.getElementById(`section-${event.payload.sectionIndex}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .subscribe();

    return () => {
      if (channel.current) void supabase.removeChannel(channel.current);
    };
  }, [setlist.id, isBroadcasting, setSyncedSongIndex, supabase]);

  // Render-time state derivation for stage notes (Song 1)
  const [prevStageSongId, setPrevStageSongId] = useState(currentSong?.id);
  const [stageNotes, setStageNotes] = useState<string | null>(() => {
    try {
      const songId = currentSong?.id || "";
      const setlistSongId = currentSetlistSong?.id || "";
      const sharedKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, true);
      const userKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, false);
      const masterKey = getAnnotationStorageKey(songId, null, null, null, false);
      const raw = typeof window !== "undefined" ? (localStorage.getItem(sharedKey) || localStorage.getItem(userKey) || localStorage.getItem(masterKey)) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.textNotes) return parsed.textNotes;
      }
    } catch {
      // ignore
    }
    return null;
  });

  if (prevStageSongId !== currentSong?.id) {
    setPrevStageSongId(currentSong?.id);
    try {
      const songId = currentSong?.id || "";
      const setlistSongId = currentSetlistSong?.id || "";
      const sharedKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, true);
      const userKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, false);
      const masterKey = getAnnotationStorageKey(songId, null, null, null, false);
      const raw = typeof window !== "undefined" ? (localStorage.getItem(sharedKey) || localStorage.getItem(userKey) || localStorage.getItem(masterKey)) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setStageNotes(parsed.textNotes || null);
      } else {
        setStageNotes(null);
      }
    } catch {
      setStageNotes(null);
    }
  }

  // Render-time state derivation for stage notes (Song 2)
  const [prevStageSongId2, setPrevStageSongId2] = useState(secondSong?.id);
  const [stageNotes2, setStageNotes2] = useState<string | null>(() => {
    try {
      const songId = secondSong?.id || "";
      const setlistSongId = secondSetlistSong?.id || "";
      const sharedKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, true);
      const userKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, false);
      const masterKey = getAnnotationStorageKey(songId, null, null, null, false);
      const raw = typeof window !== "undefined" ? (localStorage.getItem(sharedKey) || localStorage.getItem(userKey) || localStorage.getItem(masterKey)) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.textNotes) return parsed.textNotes;
      }
    } catch {
      // ignore
    }
    return null;
  });

  if (prevStageSongId2 !== secondSong?.id) {
    setPrevStageSongId2(secondSong?.id);
    try {
      const songId = secondSong?.id || "";
      const setlistSongId = secondSetlistSong?.id || "";
      const sharedKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, true);
      const userKey = getAnnotationStorageKey(songId, setlist.id, setlistSongId, null, false);
      const masterKey = getAnnotationStorageKey(songId, null, null, null, false);
      const raw = typeof window !== "undefined" ? (localStorage.getItem(sharedKey) || localStorage.getItem(userKey) || localStorage.getItem(masterKey)) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setStageNotes2(parsed.textNotes || null);
      } else {
        setStageNotes2(null);
      }
    } catch {
      setStageNotes2(null);
    }
  }

  const handleJumpToSection = (idx: number, targetColumn?: "song1" | "song2") => {
    if (isDoubleView) {
      const targetId = targetColumn === "song2" ? `song2-section-${idx}` : `song1-section-${idx}`;
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const el = document.getElementById(`section-${idx}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    
    if (isBroadcasting && channel.current) {
      channel.current.send({
        type: "broadcast",
        event: "sync_section",
        payload: { sectionIndex: idx, columnKey: targetColumn || "song1" },
      });
    }
  };

  // Reset when song changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedKey(currentSetlistSong?.assignedKey || currentSong?.originalKey || "C");
      setGuitarMode(false);
      setCapoFret(0);
      setSelectedKey2(secondSetlistSong?.assignedKey || secondSong?.originalKey || "C");
      setGuitarMode2(false);
      setCapoFret2(0);
      setMetronomePlaying(false);
      setIsScrolling(false);
    }, 0);
    if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (scrollRef2.current) scrollRef2.current.scrollTop = 0;
    return () => window.clearTimeout(timer);
  }, [
    currentSongIndex,
    currentSetlistSong?.assignedKey,
    currentSong?.originalKey,
    secondSetlistSong?.assignedKey,
    secondSong?.originalKey,
  ]);

  // Transpose Logic for Song 1
  const isMinor = currentSong?.originalKey?.endsWith("m");
  const activeKeys = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const selectedKeyIndex = activeKeys.indexOf(selectedKey);

  async function changeKey(direction: number) {
    if (selectedKeyIndex === -1) return;
    let nextIdx = (selectedKeyIndex + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    const newKey = activeKeys[nextIdx];
    setSelectedKey(newKey);
    
    if (currentSetlistSong?.id) {
      const formData = new FormData();
      formData.set("setlistId", setlist.id);
      formData.set("slotId", currentSetlistSong.id);
      formData.set("assignedKey", newKey);
      updateSetlistSongKeyAction(formData).catch(console.error); // fire and forget
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
    
    if (secondSetlistSong?.id) {
      const formData = new FormData();
      formData.set("setlistId", setlist.id);
      formData.set("slotId", secondSetlistSong.id);
      formData.set("assignedKey", newKey);
      updateSetlistSongKeyAction(formData).catch(console.error);
    }
  }

  // Capo data for Song 1
  const capoData = useMemo(() => {
    if (!guitarMode) return null;
    if (selectedKeyIndex === -1) return { chordKey: selectedKey, fret: capoFret };

    const chordKeyIndex = (selectedKeyIndex - capoFret + activeKeys.length) % activeKeys.length;
    return { chordKey: activeKeys[chordKeyIndex] ?? selectedKey, fret: capoFret };
  }, [activeKeys, capoFret, guitarMode, selectedKey, selectedKeyIndex]);

  const displayKey = capoData?.chordKey ?? selectedKey;

  // Capo data for Song 2
  const capoData2 = useMemo(() => {
    if (!guitarMode2) return null;
    if (selectedKeyIndex2 === -1) return { chordKey: selectedKey2, fret: capoFret2 };

    const chordKeyIndex = (selectedKeyIndex2 - capoFret2 + activeKeys2.length) % activeKeys2.length;
    return { chordKey: activeKeys2[chordKeyIndex] ?? selectedKey2, fret: capoFret2 };
  }, [activeKeys2, capoFret2, guitarMode2, selectedKey2, selectedKeyIndex2]);

  const displayKey2 = capoData2?.chordKey ?? selectedKey2;
  
  // Transpose the text for Song 1
  const transposedSections = useMemo(() => {
    return sections.map(sec => ({
      ...sec,
      lines: sec.lines.map(line => {
        if (line.tokens) {
          return { ...line, tokens: transposeTokens(line.tokens, baseKey, displayKey) };
        }
        if (!line.chords) return line;
        const newChords = line.chords.split(/([ \t-]+)/).map(part => {
           if (!part.trim() || part === "-" || part === "/") return part;
           if (/^[A-Ga-g]/.test(part.trim())) {
             return transposeProgression(part.trim(), baseKey, displayKey);
           }
           return part;
        }).join("");
        return { ...line, chords: newChords };
      })
    }));
  }, [sections, baseKey, displayKey]);

  const displayedSections = useMemo(() => {
    if (!showNumbers) return transposedSections;
    return transposedSections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        tokens: line.tokens ? tokensToNashville(line.tokens, displayKey) : line.tokens,
        chords: line.chords ? progressionToNashville(line.chords, displayKey) : line.chords,
      })),
    }));
  }, [displayKey, showNumbers, transposedSections]);

  // Transpose the text for Song 2
  const transposedSections2 = useMemo(() => {
    return sections2.map(sec => ({
      ...sec,
      lines: sec.lines.map(line => {
        if (line.tokens) {
          return { ...line, tokens: transposeTokens(line.tokens, baseKey2, displayKey2) };
        }
        if (!line.chords) return line;
        const newChords = line.chords.split(/([ \t-]+)/).map(part => {
           if (!part.trim() || part === "-" || part === "/") return part;
           if (/^[A-Ga-g]/.test(part.trim())) {
             return transposeProgression(part.trim(), baseKey2, displayKey2);
           }
           return part;
        }).join("");
        return { ...line, chords: newChords };
      })
    }));
  }, [sections2, baseKey2, displayKey2]);

  const displayedSections2 = useMemo(() => {
    if (!showNumbers) return transposedSections2;
    return transposedSections2.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        tokens: line.tokens ? tokensToNashville(line.tokens, displayKey2) : line.tokens,
        chords: line.chords ? progressionToNashville(line.chords, displayKey2) : line.chords,
      })),
    }));
  }, [displayKey2, showNumbers, transposedSections2]);

  // Auto Scroll Engine
  const toggleAutoScroll = useCallback(() => {
    if (isScrolling) {
      if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
      setIsScrolling(false);
    } else {
      const scrollStep = () => {
        const bpm = currentSong?.bpm || 70;
        const pixelsPerFrame = (bpm / 60) * 0.3 * scrollSpeedRef.current;
        
        if (scrollRef.current) {
          scrollRef.current.scrollBy(0, pixelsPerFrame);
        }
        if (isDoubleView && scrollRef2.current) {
          scrollRef2.current.scrollBy(0, pixelsPerFrame);
        }

        const isScrolledToEnd = scrollRef.current &&
          scrollRef.current.scrollTop + scrollRef.current.clientHeight >= scrollRef.current.scrollHeight - 2;

        if (isScrolledToEnd) {
          setIsScrolling(false);
          return;
        }
        scrollAnimationFrameRef.current = requestAnimationFrame(scrollStep);
      };
      scrollAnimationFrameRef.current = requestAnimationFrame(scrollStep);
      setIsScrolling(true);
    }
  }, [currentSong?.bpm, isDoubleView, isScrolling]);

  // Metronome Engine
  useEffect(() => {
    if (!metronomePlaying || !currentSong?.bpm) return;
    const intervalMs = (60 / currentSong.bpm) * 1000;
    
    let beat = 1;
    const initialTick = window.setTimeout(() => {
      setCurrentBeat(beat);
      playClick(beat, 0.8);
    }, 0);

    const timer = setInterval(() => {
      beat = beat === 4 ? 1 : beat + 1;
      setCurrentBeat(beat);
      playClick(beat, 0.8);
    }, intervalMs);

    return () => {
      window.clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, [metronomePlaying, currentSong?.bpm]);

  // Foot pedal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === " ") { e.preventDefault(); toggleAutoScroll(); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (currentSongIndex < setlist.songs.length - 1) setSyncedSongIndex(i => i + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (currentSongIndex > 0) setSyncedSongIndex(i => i - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSongIndex, setlist.songs.length, setSyncedSongIndex, toggleAutoScroll]);

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
    const time = Date.now() - touchStartTime;
    
    if (time < maxSwipeTime) {
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      
      if (isLeftSwipe && currentSongIndex < setlist.songs.length - 1) {
        setSyncedSongIndex(i => i + 1);
      }
      if (isRightSwipe && currentSongIndex > 0) {
        setSyncedSongIndex(i => i - 1);
      }
    }
  };

  if (!currentSong) return null;

  return (
    <div className={cn("fixed inset-0 h-[100dvh] bg-black text-white flex flex-col font-sans overflow-hidden transition-shadow duration-300 z-50", metronomePlaying && currentBeat === 1 ? "shadow-[inset_0_0_100px_rgba(255,255,255,0.1)]" : "")}>
      
      {/* Top Bar - Tools */}
      <div className="flex items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-zinc-950 border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar gap-4 md:gap-8 z-30">
        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <Link href={`/setlists/${setlist.id}`} className="p-2 rounded-full hover:bg-white/10 transition">
            <X className="size-5 md:size-6 text-zinc-400" />
          </Link>
          <div className="flex flex-col justify-center">
            <h1 className="text-base md:text-xl font-bold flex items-center gap-2">
               <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
                {isDoubleView && secondSong
                  ? `${currentSong.title} & ${secondSong.title}`
                  : currentSong.title}
               </span>
               {isDoubleView && (
                 <span className="px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-300 text-[10px] md:text-xs font-black tracking-widest uppercase border border-violet-500/40 whitespace-nowrap">
                   DOUBLE VIEW
                 </span>
               )}
               {!isDoubleView && guitarMode && (
                 <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                   {capoFret === 0 ? "Open" : `Capo ${capoFret}`}
                 </span>
               )}
            </h1>
            <div className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1 flex flex-col gap-1">
              <span>{currentSong.bpm || 70} BPM</span>
              {currentSetlistSong.arrangement && !isDoubleView && (
                <span className="text-violet-300 truncate max-w-[200px] md:max-w-md" title={currentSetlistSong.arrangement}>
                  {currentSetlistSong.arrangement}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Stage Tools */}
        <div className="flex items-center gap-3 md:gap-6 shrink-0">
           {/* Double View Toggle Button */}
           <button
             type="button"
             onClick={toggleDoubleView}
             className={cn(
               "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition border min-h-[40px]",
               isDoubleView
                 ? "bg-violet-600/25 border-violet-500 text-violet-200 shadow-md ring-1 ring-violet-500/50"
                 : "bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
             )}
             title="Toggle Double View (Side-by-Side 2 Songs on Landscape)"
             aria-label="Toggle Double View"
           >
             <Columns2 className="size-4 text-violet-400" />
             <span className="hidden sm:inline">Double View</span>
           </button>

           {/* Single View Transpose Controls */}
           {!isDoubleView && (
             <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
               <button onClick={() => changeKey(-1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white">
                 <Minus className="size-4" />
               </button>
               <span className="w-12 text-center font-bold text-lg">{selectedKey}</span>
               <button onClick={() => changeKey(1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white">
                 <Plus className="size-4" />
               </button>
             </div>
           )}

           <ChordNotationToggle
             value={showNumbers ? "nashville" : "chords"}
             onChange={(notation) => setShowNumbers(notation === "nashville")}
           />

           {/* Font Size */}
           <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
             <button onClick={() => setFontScale(s => Math.max(0.6, s - 0.1))} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white font-bold text-xs" title="Decrease Font">
               A-
             </button>
             <span className="w-10 text-center font-bold text-sm">{Math.round(fontScale * 100)}%</span>
             <button onClick={() => setFontScale(s => Math.min(1.8, s + 0.1))} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white font-bold text-sm" title="Increase Font">
               A+
             </button>
           </div>
           
           {/* Single View Guitar Mode (Capo) */}
           {!isDoubleView && (
             <div className="flex items-center gap-2">
               <button
                 onClick={() => setGuitarMode(!guitarMode)}
                 className={cn("p-3 rounded-lg transition border", guitarMode ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
                 title="Guitar Mode (Capo)"
               >
                 <Guitar className="size-5" />
               </button>
               {guitarMode && (
                 <select
                   aria-label="Capo fret"
                   value={capoFret}
                   onChange={(event) => setCapoFret(Number(event.target.value))}
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
           
           {/* Metronome */}
           <button 
             onClick={() => setMetronomePlaying(!metronomePlaying)}
             className={cn("p-3 rounded-lg transition border", metronomePlaying ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
             title="Metronome"
           >
             {metronomePlaying ? <Square className="size-5" /> : <Play className="size-5" />}
           </button>
           
           {/* Auto Scroll Speed */}
           <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1" title="Auto Scroll (Spacebar)">
             <button onClick={toggleAutoScroll} className={cn("p-2 rounded transition", isScrolling ? "bg-violet-600/20 text-violet-400" : "text-zinc-400 hover:text-white")}>
               <ChevronsDown className="size-4" />
             </button>
             <input 
               type="range" min="0.2" max="3" step="0.1" 
               value={scrollSpeed} 
               onChange={(e) => setScrollSpeed(parseFloat(e.target.value))} 
               className="w-16 md:w-24 mx-2 accent-violet-500"
               title="Scroll Speed"
             />
           </div>
           
           {/* Broadcast Sync */}
           <button 
             onClick={() => setIsBroadcasting(!isBroadcasting)}
             className={cn("p-3 rounded-lg transition border", isBroadcasting ? "bg-amber-500/20 border-amber-500/50 text-amber-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
             title="Broadcast Song Changes to Band"
           >
             <Radio className="size-5" />
           </button>
           
           <div className="w-px h-8 bg-white/10 mx-1" />
           
           {/* Navigation */}
           <div className="flex items-center gap-1 md:gap-2 shrink-0">
             <button
               type="button"
               onClick={() => currentSongIndex > 0 && setSyncedSongIndex(i => i - 1)}
               disabled={currentSongIndex === 0}
               className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"
               aria-label="Previous Song"
             >
               <ChevronLeft className="size-5 md:size-6" />
             </button>
             <span className="text-xs md:text-sm font-bold text-zinc-400 w-10 md:w-16 text-center font-mono">
               {isDoubleView && secondSong
                 ? `${currentSongIndex + 1}-${currentSongIndex + 2}/${setlist.songs.length}`
                 : `${currentSongIndex + 1}/${setlist.songs.length}`}
             </span>
             <button
               type="button"
               onClick={() => currentSongIndex < setlist.songs.length - 1 && setSyncedSongIndex(i => i + 1)}
               disabled={currentSongIndex === setlist.songs.length - 1}
               className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"
               aria-label="Next Song"
             >
               <ChevronRight className="size-5 md:size-6" />
             </button>
           </div>
        </div>
      </div>

      {/* Arrangement Blocks (Desktop Single View Header Bar) */}
      {!isDoubleView && (
        <div className="hidden md:flex items-center gap-2 px-6 py-3 bg-zinc-900 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-20">
          {displayedSections.map((section, idx) => {
            if (!section.label || section.label === "unknown") return null;
            const colorClass = getSectionColorClass(section.label);
            return (
              <button 
                key={idx}
                type="button"
                onClick={() => handleJumpToSection(idx)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition hover:brightness-125", colorClass)}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      {isDoubleView ? (
        /* DOUBLE VIEW: Outer Left Flank | Song 1 Column | Song 2 Column | Outer Right Flank */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Flank Sidebar: Song 1 Controls */}
          <ArrangementFlankSidebar
            side="left"
            songNumberLabel="Song 1"
            songTitle={currentSong.title}
            sections={displayedSections}
            onJumpToSection={(idx) => handleJumpToSection(idx, "song1")}
          />

          {/* Center Left: Song 1 Chord Chart */}
          <DoubleViewChordColumn
            columnKey="song1"
            songLabel="Song 1"
            song={currentSong}
            selectedKey={selectedKey}
            onChangeKey={changeKey}
            guitarMode={guitarMode}
            onToggleGuitarMode={() => setGuitarMode(!guitarMode)}
            capoFret={capoFret}
            onChangeCapoFret={setCapoFret}
            fontScale={fontScale}
            displayedSections={displayedSections}
            scrollRef={scrollRef}
            setlistId={setlist.id}
            stageNotes={stageNotes}
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
            setlistId={setlist.id}
            stageNotes={stageNotes2}
            emptyStateMessage="End of Setlist"
          />

          {/* Right Flank Sidebar: Song 2 Controls */}
          <ArrangementFlankSidebar
            side="right"
            songNumberLabel="Song 2"
            songTitle={secondSong?.title || "End"}
            sections={displayedSections2}
            onJumpToSection={(idx) => handleJumpToSection(idx, "song2")}
          />
        </div>
      ) : (
        /* SINGLE VIEW: Standard Single Song Layout */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Chord Chart Area */}
          <div 
            ref={scrollRef} 
            style={{ "--user-font-scale": fontScale } as FontScaleStyle}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-10 pb-64 relative"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <AnnotationCanvas
              songId={currentSong?.id || ""}
              setlistId={setlist.id}
              setlistSongId={currentSetlistSong?.id}
              songTitle={currentSong?.title}
              containerRef={scrollRef}
            />
            
            <div className="max-w-4xl mx-auto space-y-8 relative z-10">
              {stageNotes && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-950/80 p-3 text-xs font-semibold text-amber-200 shadow-md">
                  <span className="font-bold uppercase tracking-wider text-amber-400 block mb-1">Musician Notes:</span>
                  <p className="whitespace-pre-wrap">{stageNotes}</p>
                </div>
              )}
              {displayedSections.map((section, idx) => (
                <div key={idx} id={`section-${idx}`} className="space-y-3 scroll-mt-6">
                  {section.label && section.label !== "unknown" && (
                    <div className={cn(
                      "inline-block rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider",
                      getSectionColorClass(section.label),
                    )}>
                      {section.label}
                    </div>
                  )}
                  <div className="space-y-4">
                    {section.lines.map((line, lIdx) => (
                      <div key={lIdx} className="leading-relaxed max-w-full overflow-x-auto no-scrollbar">
                        {line.tokens ? (
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
              ))}
            </div>
          </div>

          {/* Arrangement Blocks (Mobile Right Panel) */}
          <div className="md:hidden flex flex-col items-center gap-3 py-4 w-16 bg-zinc-900 border-l border-white/5 overflow-y-auto shrink-0 z-40">
            {displayedSections.map((section, idx) => {
              if (!section.label || section.label === "unknown") return null;
              const colorClass = getSectionColorClass(section.label);
              return (
                <button 
                  key={idx}
                  type="button"
                  onClick={() => handleJumpToSection(idx)}
                  className={cn("w-12 py-3 rounded-lg text-xs font-black uppercase tracking-tighter border transition hover:brightness-125 shadow-md", colorClass)}
                  title={section.label}
                >
                  {getSectionAbbr(section.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Floating Auto-Scroll Status */}
      <div className="absolute bottom-8 right-8 pointer-events-none z-50">
         <div className={cn("px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-opacity duration-500", isScrolling ? "opacity-100 bg-violet-600/80 text-white shadow-lg" : "opacity-0")}>
           Auto-Scrolling
         </div>
      </div>
    </div>
  );
}
