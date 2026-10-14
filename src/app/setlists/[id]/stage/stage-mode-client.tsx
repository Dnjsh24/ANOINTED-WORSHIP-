"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Minus, Plus, Play, Square, Radio, Guitar, ChevronsDown } from "lucide-react";
import { parseLyricsAndChords, transposeProgression, transposeTokens } from "@/lib/domain/chords";
import { cn } from "@/lib/utils";
import { createOptionalClient } from "@/lib/supabase/client";
import { updateSetlistSongKeyAction } from "@/app/actions";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import type { ReactNode } from "react";
import { RehearsalNote } from "@/components/rehearsal-note";
import { ChartAnnotations } from "@/components/chart-annotations";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const EASY_GUITAR_KEYS = ["G", "C", "D", "A", "E"];

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

// Helper for abbreviation on mobile
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
    rehearsalNotes?: string;
    song: {
      id: string | undefined;
      title: string;
      bpm: number;
      originalKey: string;
      timeSignature?: string;
      lyricsChords: string;
    };
  }>;
};

export type StageSetlistSong = StageSetlist["songs"][number];
export type PracticeToolsRenderer = (song: StageSetlistSong, close: () => void, selectSong: (slotId: string) => void) => ReactNode;

function getMeterBeatCount(timeSignature?: string): number {
  const numerator = Number(timeSignature?.split("/")[0]);
  return Number.isInteger(numerator) && numerator >= 1 && numerator <= 12 ? numerator : 4;
}

type FontScaleStyle = CSSProperties & { "--user-font-scale": number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function StageModeClient({
  setlist,
  renderPracticeTools,
  canManageSetlist = false,
  demoMode = false,
  rehearsalNotesMessage,
}: {
  setlist: StageSetlist;
  renderPracticeTools?: PracticeToolsRenderer;
  canManageSetlist?: boolean;
  demoMode?: boolean;
  rehearsalNotesMessage?: string;
}) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [practiceToolsOpen, setPracticeToolsOpen] = useState(false);
  const [practiceToolsMounted, setPracticeToolsMounted] = useState(false);
  const [keySaveStatus, setKeySaveStatus] = useState("");
  const [keySaveError, setKeySaveError] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const closePracticeTools = useCallback(() => setPracticeToolsOpen(false), []);
  const practiceToolsRef = useAccessibleDialog({ open: practiceToolsOpen, onClose: closePracticeTools });
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartContentRef = useRef<HTMLDivElement>(null);
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

  const currentSetlistSong = setlist.songs[currentSongIndex];
  const currentSong = currentSetlistSong?.song;
  const keySlotRef = useRef(currentSetlistSong?.id);
  useEffect(() => { keySlotRef.current = currentSetlistSong?.id; }, [currentSetlistSong?.id]);
  const rawLyrics = currentSong?.lyricsChords || "";
  const sections = parseLyricsAndChords(rawLyrics);
  const timeSignature = currentSong?.timeSignature ?? "4/4";
  const beatsPerMeasure = getMeterBeatCount(timeSignature);

  const baseKey = currentSong?.originalKey || "C";
  const initialKey = currentSetlistSong?.assignedKey || currentSong?.originalKey || "C";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [guitarMode, setGuitarMode] = useState(false);
  
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
          const el = document.getElementById(`section-${event.payload.sectionIndex}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .subscribe();

    return () => {
      if (channel.current) void supabase.removeChannel(channel.current);
    };
  }, [setlist.id, isBroadcasting, setSyncedSongIndex, supabase]);

  const handleJumpToSection = (idx: number) => {
    const el = document.getElementById(`section-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    
    if (isBroadcasting && channel.current) {
      channel.current.send({ type: "broadcast", event: "sync_section", payload: { sectionIndex: idx } });
    }
  };

  // Reset when song changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedKey(currentSetlistSong?.assignedKey || currentSong?.originalKey || "C");
      setGuitarMode(false);
      setMetronomePlaying(false);
      setIsScrolling(false);
      setCurrentBeat(1);
      setKeySaveStatus("");
      setKeySaveError("");
    }, 0);
    if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return () => window.clearTimeout(timer);
  }, [currentSongIndex, currentSetlistSong?.assignedKey, currentSong?.originalKey]);

  // Transpose Logic
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
      if (renderPracticeTools && !canManageSetlist) {
        setKeySaveError("");
        setKeySaveStatus("Key changed for this practice session. Your role cannot save setlist keys.");
        return;
      }
      const formData = new FormData();
      formData.set("setlistId", setlist.id);
      formData.set("slotId", currentSetlistSong.id);
      formData.set("assignedKey", newKey);
      if (!renderPracticeTools) {
        updateSetlistSongKeyAction(formData).catch(console.error);
        return;
      }

      setIsSavingKey(true);
      setKeySaveStatus("Saving key…");
      setKeySaveError("");
      const savedSlotId = currentSetlistSong.id;
      try {
        const result = await updateSetlistSongKeyAction(formData);
        if (keySlotRef.current !== savedSlotId) return;
        if (!result.ok) {
          setSelectedKey(selectedKey);
          setKeySaveError(`Key was not saved. ${result.message}`);
          setKeySaveStatus("");
          return;
        }
        setKeySaveStatus("Key saved to setlist.");
      } catch {
        if (keySlotRef.current !== savedSlotId) return;
        setSelectedKey(selectedKey);
        setKeySaveError("Key was not saved. Please retry.");
        setKeySaveStatus("");
      } finally {
        setIsSavingKey(false);
      }
    }
  }

  // Capo Logic (Guitar Mode)
  // Easiest guitar keys: G, C, D, A, E
  const capoData = useMemo(() => {
    if (!guitarMode) return null;
    
    // Find the closest easy key below the selectedKey
    // selectedKeyIndex is our target sound.
    // We want to find an easy key index such that selectedKeyIndex >= easyKeyIndex
    let bestKey = selectedKey;
    let bestFret = 0;
    
    if (!isMinor) {
      for (const easy of EASY_GUITAR_KEYS) {
        const easyIdx = MAJOR_KEYS.indexOf(easy);
        if (easyIdx === -1) continue;
        let fret = selectedKeyIndex - easyIdx;
        if (fret < 0) fret += 12; // Wrap around
        if (fret <= 6) { // Prefer capo 6 or below
          bestKey = easy;
          bestFret = fret;
          break; // Found one
        }
      }
    }
    
    if (bestFret === 0) return null; // No capo needed or minor key not supported yet
    
    return { chordKey: bestKey, fret: bestFret };
  }, [guitarMode, selectedKey, selectedKeyIndex, isMinor]);

  const displayKey = guitarMode && capoData ? capoData.chordKey : selectedKey;
  
  // Transpose the text
  const transposedSections = useMemo(() => {
    return sections.map(sec => ({
      ...sec,
      lines: sec.lines.map(line => {
        if (line.tokens) {
          // ChordPro format: transpose each token's chord
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

  // Auto Scroll Engine
  const toggleAutoScroll = useCallback(() => {
    if (isScrolling) {
      if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
      setIsScrolling(false);
    } else {
      const scrollStep = () => {
        if (scrollRef.current) {
          const bpm = currentSong?.bpm || 70;
          const pixelsPerFrame = (bpm / 60) * 0.3 * scrollSpeedRef.current; 
          scrollRef.current.scrollBy(0, pixelsPerFrame);
          if (scrollRef.current.scrollTop + scrollRef.current.clientHeight >= scrollRef.current.scrollHeight - 2) {
            setIsScrolling(false);
            return;
          }
        }
        scrollAnimationFrameRef.current = requestAnimationFrame(scrollStep);
      };
      scrollAnimationFrameRef.current = requestAnimationFrame(scrollStep);
      setIsScrolling(true);
    }
  }, [currentSong?.bpm, isScrolling]);

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
      beat = beat === beatsPerMeasure ? 1 : beat + 1;
      setCurrentBeat(beat);
      playClick(beat, 0.8);
    }, intervalMs);

    return () => {
      window.clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, [metronomePlaying, currentSong?.bpm, beatsPerMeasure]);

  // Foot pedal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (practiceToolsOpen || e.defaultPrevented) return;
      if (document.activeElement?.closest("input, textarea, select, [data-chart-annotation]")) return;
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
  }, [currentSongIndex, setlist.songs.length, setSyncedSongIndex, toggleAutoScroll, practiceToolsOpen]);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-chart-annotation]")) { setTouchStartX(null); return; }
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

  const selectStageSong = (slotId: string) => {
    const nextIndex = setlist.songs.findIndex((song) => song.id === slotId);
    if (nextIndex >= 0) setSyncedSongIndex(nextIndex);
  };

  if (!currentSong) return null;

  return (
    <div data-wooly-target="stage-chart" className={cn("fixed inset-0 h-[100dvh] bg-black text-white flex flex-col font-sans overflow-hidden transition-shadow duration-300 z-50", metronomePlaying && currentBeat === 1 ? "shadow-[inset_0_0_100px_rgba(255,255,255,0.1)]" : "")}>
      
      {/* Top Bar - Tools */}
      <div data-wooly-target="stage-controls" className="flex items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-zinc-950 border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar gap-4 md:gap-8">
        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <Link href={`/setlists/${setlist.id}`} className="p-2 rounded-full hover:bg-white/10 transition">
            <X className="size-5 md:size-6 text-zinc-400" />
          </Link>
          <div className="flex flex-col justify-center">
            <h1 className="text-base md:text-xl font-bold flex items-center gap-2">
               <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{currentSong.title}</span>
               {guitarMode && capoData && (
                 <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                   Capo {capoData.fret}
                 </span>
               )}
            </h1>
            <div className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1 flex flex-col gap-1">
              <span>{currentSong.bpm || 70} BPM</span>
              <span>{timeSignature} meter · beat {currentBeat > beatsPerMeasure ? 1 : currentBeat || 1} of {beatsPerMeasure}</span>
              {currentSetlistSong.arrangement && (
                <span className="text-violet-300 truncate max-w-[200px] md:max-w-md" title={currentSetlistSong.arrangement}>
                  {currentSetlistSong.arrangement}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Stage Tools */}
        <div className="flex items-center gap-4 md:gap-6 shrink-0">
           {/* Transpose */}
           <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
             <button type="button" aria-label="Lower setlist key" disabled={isSavingKey} onClick={() => changeKey(-1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white disabled:opacity-50">
               <Minus className="size-4" />
             </button>
             <span className="w-12 text-center font-bold text-lg">{selectedKey}</span>
             <button type="button" aria-label="Raise setlist key" disabled={isSavingKey} onClick={() => changeKey(1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white disabled:opacity-50">
               <Plus className="size-4" />
             </button>
           </div>

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
           
           {/* Guitar Mode (Capo) */}
           <button 
             onClick={() => setGuitarMode(!guitarMode)}
             className={cn("p-3 rounded-lg transition border", guitarMode ? "bg-violet-600/20 border-violet-500/50 text-violet-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
             title="Guitar Mode (Capo)"
           >
             <Guitar className="size-5" />
           </button>
           
           {/* Metronome */}
           <button 
             type="button"
             onClick={() => setMetronomePlaying(!metronomePlaying)}
             className={cn("p-3 rounded-lg transition border", metronomePlaying ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
             title="Metronome"
             aria-label={metronomePlaying ? "Stop metronome" : "Start metronome"}
           >
             {metronomePlaying ? <Square className="size-5" /> : <Play className="size-5" />}
           </button>
           
           {/* Auto Scroll Speed */}
           <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1" title="Auto Scroll (Spacebar)">
             <button type="button" aria-label={isScrolling ? "Stop auto-scroll" : "Start auto-scroll"} onClick={toggleAutoScroll} className={cn("p-2 rounded transition", isScrolling ? "bg-violet-600/20 text-violet-400" : "text-zinc-400 hover:text-white")}>
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
           
           <div className="w-px h-8 bg-white/10 mx-2" />
           
           {/* Navigation */}
           <div className="flex items-center gap-1 md:gap-2 shrink-0">
             <button type="button" aria-label="Previous song" onClick={() => currentSongIndex > 0 && setSyncedSongIndex(i => i - 1)} disabled={currentSongIndex === 0} className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition">
               <ChevronLeft className="size-5 md:size-6" />
             </button>
             <span className="text-xs md:text-sm font-bold text-zinc-500 w-8 md:w-12 text-center">
               {currentSongIndex + 1} / {setlist.songs.length}
             </span>
             <button type="button" aria-label="Next song" onClick={() => currentSongIndex < setlist.songs.length - 1 && setSyncedSongIndex(i => i + 1)} disabled={currentSongIndex === setlist.songs.length - 1} className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition">
               <ChevronRight className="size-5 md:size-6" />
             </button>
           </div>

           {renderPracticeTools && (
             <button
               type="button"
               aria-expanded={practiceToolsOpen}
               aria-controls="practice-tools-panel"
               onClick={() => { setPracticeToolsMounted(true); setPracticeToolsOpen(true); }}
               className="min-h-11 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 text-xs font-bold text-violet-200 transition hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
             >
               Practice & edit
             </button>
           )}
        </div>
      </div>

      {/* Arrangement Blocks (Desktop) */}
      <div className="hidden md:flex items-center gap-2 px-6 py-3 bg-zinc-900 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
        {transposedSections.map((section, idx) => {
          if (!section.label || section.label === "unknown") return null;
          
          let colorClass = "bg-zinc-800 text-zinc-300 border-zinc-700";
          const lbl = section.label.toLowerCase();
          if (lbl.includes("chorus")) colorClass = "bg-blue-900/50 text-blue-300 border-blue-500/30";
          else if (lbl.includes("bridge")) colorClass = "bg-rose-900/50 text-rose-300 border-rose-500/30";
          else if (lbl.includes("verse")) colorClass = "bg-emerald-900/50 text-emerald-300 border-emerald-500/30";
          else if (lbl.includes("intro") || lbl.includes("outro")) colorClass = "bg-amber-900/50 text-amber-300 border-amber-500/30";
          
          return (
            <button 
              key={idx}
              onClick={() => handleJumpToSection(idx)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition hover:brightness-125", colorClass)}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      {rehearsalNotesMessage && <p role="status" className="shrink-0 px-4 py-2 text-sm text-amber-200">Rehearsal notes: {rehearsalNotesMessage}</p>}
      <RehearsalNote setlistId={setlist.id} slotId={currentSetlistSong.id} note={currentSetlistSong.rehearsalNotes} demoMode={demoMode} stage />
      <div className="flex-1 flex overflow-hidden">
        {/* Chord Chart Area */}
        <div data-wooly-target="practice-chart"
          ref={scrollRef} 
          style={{ "--user-font-scale": fontScale } as FontScaleStyle}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-10 pb-64 relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
        <ChartAnnotations
          setlistId={setlist.id}
          slotId={currentSetlistSong.id}
          songId={currentSong.id}
          editable={Boolean(renderPracticeTools)}
          containerRef={scrollRef}
          contentRef={chartContentRef}
        />
        <div ref={chartContentRef} className="max-w-4xl mx-auto space-y-8 relative z-10">
          {transposedSections.map((section, idx) => (
            <div key={idx} id={`section-${idx}`} className="space-y-3 scroll-mt-6">
              {section.label && section.label !== "unknown" && (
                <div className="inline-block px-3 py-1 rounded bg-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  {section.label}
                </div>
              )}
              <div className="space-y-4">
                {section.lines.map((line, lIdx) => (
                  <div key={lIdx} className="leading-relaxed max-w-full overflow-x-auto no-scrollbar">
                    {line.tokens ? (
                      // ChordPro inline: chord perfectly above each syllable
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
                      // Legacy space-aligned format
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
        {transposedSections.map((section, idx) => {
          if (!section.label || section.label === "unknown") return null;
          
          let colorClass = "bg-zinc-800 text-zinc-300 border-zinc-700";
          const lbl = section.label.toLowerCase();
          if (lbl.includes("chorus")) colorClass = "bg-blue-900/50 text-blue-300 border-blue-500/30";
          else if (lbl.includes("bridge")) colorClass = "bg-rose-900/50 text-rose-300 border-rose-500/30";
          else if (lbl.includes("verse")) colorClass = "bg-emerald-900/50 text-emerald-300 border-emerald-500/30";
          else if (lbl.includes("intro") || lbl.includes("outro")) colorClass = "bg-amber-900/50 text-amber-300 border-amber-500/30";
          
          return (
            <button 
              key={idx}
              onClick={() => handleJumpToSection(idx)}
              className={cn("w-12 py-3 rounded-lg text-xs font-black uppercase tracking-tighter border transition hover:brightness-125 shadow-md", colorClass)}
              title={section.label}
            >
              {getAbbr(section.label)}
            </button>
          );
        })}
      </div>
      
      {/* Floating Auto-Scroll Status */}
      <div className="absolute bottom-8 right-8 pointer-events-none z-50">
         <div className={cn("px-4 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-opacity duration-500", isScrolling ? "opacity-100 bg-violet-600/80 text-white shadow-lg" : "opacity-0")}>
           Auto-Scrolling
         </div>
      </div>
      {!practiceToolsOpen && keySaveStatus && <p role="status" className="fixed bottom-4 left-4 z-[55] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 shadow-lg">{keySaveStatus}</p>}
      {!practiceToolsOpen && keySaveError && <p role="alert" className="fixed bottom-4 left-4 z-[55] rounded-lg border border-red-400/30 bg-zinc-900 px-3 py-2 text-xs text-red-200 shadow-lg">{keySaveError}</p>}
      {renderPracticeTools && practiceToolsMounted && currentSetlistSong && (
        <>
          {practiceToolsOpen && <button
            type="button"
            aria-label="Close practice and edit panel"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closePracticeTools}
            className="fixed inset-0 z-[60] cursor-default bg-black/70 backdrop-blur-sm"
          />}
          <aside
            ref={practiceToolsRef}
            id="practice-tools-panel"
            role="dialog"
            aria-modal={practiceToolsOpen ? true : undefined}
            aria-labelledby="practice-tools-title"
            hidden={!practiceToolsOpen}
            tabIndex={-1}
            className={cn("fixed inset-y-0 right-0 z-[61] w-full max-w-xl flex-col border-l border-white/10 bg-zinc-950 shadow-2xl", practiceToolsOpen ? "flex" : "hidden")}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h2 id="practice-tools-title" className="font-bold text-white">Practice & edit</h2>
                <p className="mt-1 truncate text-xs text-zinc-400">{currentSong.title}</p>
              </div>
              <button type="button" onClick={closePracticeTools} className="min-h-11 rounded-md px-3 text-sm font-semibold text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">Close</button>
            </div>
            {keySaveStatus && <p role="status" className="border-b border-white/10 px-5 py-2 text-xs text-violet-200">{keySaveStatus}</p>}
            {keySaveError && <p role="alert" className="border-b border-white/10 px-5 py-2 text-xs text-red-200">{keySaveError}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {renderPracticeTools(currentSetlistSong, closePracticeTools, selectStageSong)}
            </div>
          </aside>
        </>
      )}
      </div>
    </div>
  );
}
