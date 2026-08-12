"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Minus, Plus, Play, Square, PenTool, Radio, Eraser, Guitar, ChevronsDown } from "lucide-react";
import { progressionToNashville, tokensToNashville, transposeProgression, transposeTokens } from "@/lib/domain/chords";
import { ChordNotationToggle } from "@/components/chord-notation-toggle";
import {
  resolveArrangementSongSections,
  type ArrangementSection,
} from "@/lib/domain/arrangements";
import { cn } from "@/lib/utils";
import { createOptionalClient } from "@/lib/supabase/client";
import { updateSetlistSongKeyAction } from "@/app/actions";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
const CAPO_FRETS = Array.from({ length: 12 }, (_, fret) => fret);
const ANNOTATION_COLORS = [
  { name: "yellow", value: "#facc15" },
  { name: "red", value: "#ef4444" },
  { name: "blue", value: "#3b82f6" },
  { name: "green", value: "#22c55e" },
  { name: "white", value: "#ffffff" },
] as const;

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

function getSectionLabelColor(label: string) {
  const normalizedLabel = label.toLowerCase();

  if (normalizedLabel.includes("pre-chorus") || normalizedLabel.includes("prechorus")) {
    return "bg-violet-900/50 text-violet-300 border-violet-500/30";
  }
  if (normalizedLabel.includes("chorus")) {
    return "bg-blue-900/50 text-blue-300 border-blue-500/30";
  }
  if (normalizedLabel.includes("bridge")) {
    return "bg-rose-900/50 text-rose-300 border-rose-500/30";
  }
  if (normalizedLabel.includes("verse")) {
    return "bg-emerald-900/50 text-emerald-300 border-emerald-500/30";
  }
  if (normalizedLabel.includes("intro")) {
    return "bg-amber-900/50 text-amber-300 border-amber-500/30";
  }
  if (normalizedLabel.includes("outro") || normalizedLabel.includes("ending")) {
    return "bg-orange-900/50 text-orange-300 border-orange-500/30";
  }
  if (normalizedLabel.includes("instrumental") || normalizedLabel.includes("interlude") || normalizedLabel.includes("solo")) {
    return "bg-cyan-900/50 text-cyan-300 border-cyan-500/30";
  }
  if (normalizedLabel.includes("tag")) {
    return "bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-500/30";
  }
  if (normalizedLabel.includes("vamp")) {
    return "bg-lime-900/50 text-lime-300 border-lime-500/30";
  }

  return "bg-zinc-800 text-zinc-300 border-zinc-700";
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const annotationStorageKey = currentSetlistSong?.id
    ? `scribbles_${setlist.id}_${currentSetlistSong.id}`
    : null;
  const legacyAnnotationStorageKey = currentSong?.id
    ? `scribbles_${setlist.id}_${currentSong.id}`
    : null;
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
          const el = document.getElementById(`section-${event.payload.sectionIndex}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .subscribe();

    return () => {
      if (channel.current) void supabase.removeChannel(channel.current);
    };
  }, [setlist.id, isBroadcasting, setSyncedSongIndex, supabase]);

  // --- Phase 4: Scribbles (Canvas) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penTool, setPenTool] = useState<"pen" | "eraser">("pen");
  const [penSize, setPenSize] = useState(4);
  const [penColor, setPenColor] = useState("#facc15");
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<"saved" | "error" | null>(null);

  // Load scribbles on song change
  useEffect(() => {
    if (!annotationStorageKey || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Load from local storage (Free alternative to DB)
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(annotationStorageKey);
      if (!saved && legacyAnnotationStorageKey) {
        saved = localStorage.getItem(legacyAnnotationStorageKey);
      }
    } catch {
      saved = null;
    }
    if (saved) {
      const img = new Image();
      img.onload = () => {
        if (canvasRef.current) {
          // Adjust canvas size to match scroll height before drawing
          canvasRef.current.width = scrollRef.current?.scrollWidth || 1000;
          canvasRef.current.height = scrollRef.current?.scrollHeight || 2000;
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = saved;
    } else {
      // Setup canvas size anyway
      if (scrollRef.current) {
        canvasRef.current.width = scrollRef.current.scrollWidth;
        canvasRef.current.height = scrollRef.current.scrollHeight;
      }
    }
  }, [annotationStorageKey, legacyAnnotationStorageKey]);

  // Handle Resize of canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && scrollRef.current) {
         const current = canvasRef.current.toDataURL();
         // Match the exact scroll dimensions of the lyrics content
         canvasRef.current.width = scrollRef.current.scrollWidth;
         canvasRef.current.height = scrollRef.current.scrollHeight;
         // Restore drawing after resize
         const img = new Image();
         img.onload = () => canvasRef.current?.getContext("2d")?.drawImage(img, 0, 0);
         img.src = current;
      }
    };

    // Need a tiny timeout to allow the DOM (lyrics) to finish rendering so scrollHeight is accurate
    const timer = setTimeout(handleResize, 100);
    window.addEventListener("resize", handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [currentSongIndex, fontScale, drawMode]);

  const saveScribbles = useCallback(() => {
    if (canvasRef.current && annotationStorageKey) {
      try {
        localStorage.setItem(annotationStorageKey, canvasRef.current.toDataURL());
        setAnnotationSaveStatus("saved");
      } catch {
        setAnnotationSaveStatus("error");
      }
    }
  }, [annotationStorageKey]);

  const startDrawing = (e: React.PointerEvent) => {
    if (!drawMode || !canvasRef.current) return;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.PointerEvent) => {
    if (!isDrawing || !drawMode || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = penTool === "pen" ? penColor : "rgba(0,0,0,1)";
    ctx.globalCompositeOperation = penTool === "eraser" ? "destination-out" : "source-over";
    // Make the eraser 4x larger than the pen size automatically for easier erasing
    ctx.lineWidth = penTool === "eraser" ? penSize * 4 : penSize;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveScribbles();
  };

  const drawState = useRef({ isDrawing: false, tool: penTool, size: penSize, color: penColor });
  const saveScribblesRef = useRef(saveScribbles);
  
  // Sync refs so native events get latest state
  useEffect(() => {
    drawState.current = { isDrawing, tool: penTool, size: penSize, color: penColor };
    saveScribblesRef.current = saveScribbles;
  }, [isDrawing, penTool, penSize, penColor, saveScribbles]);

  // Touch logic: 1-finger draw, 2-finger scroll/zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (drawMode && e.touches.length === 1) {
        e.preventDefault(); // Stop scrolling for 1-finger drawing
        setIsDrawing(true);
        drawState.current.isDrawing = true;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.beginPath();
        const rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (drawMode && e.touches.length === 1 && drawState.current.isDrawing) {
        e.preventDefault();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        
        const { tool, size, color } = drawState.current;
        ctx.strokeStyle = tool === "pen" ? color : "rgba(0,0,0,1)";
        ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
        ctx.lineWidth = tool === "eraser" ? size * 4 : size;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    };

    const handleTouchEnd = () => {
      if (drawState.current.isDrawing) {
        setIsDrawing(false);
        drawState.current.isDrawing = false;
        saveScribblesRef.current();
      }
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [drawMode]);

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
      setCapoFret(0);
      setMetronomePlaying(false);
      setIsScrolling(false);
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
      const formData = new FormData();
      formData.set("setlistId", setlist.id);
      formData.set("slotId", currentSetlistSong.id);
      formData.set("assignedKey", newKey);
      updateSetlistSongKeyAction(formData).catch(console.error); // fire and forget
    }
  }

  // A capo raises the played chord shapes by the selected number of semitones.
  // Move the displayed shapes down by the same amount to preserve the concert key.
  const capoData = useMemo(() => {
    if (!guitarMode) return null;
    if (selectedKeyIndex === -1) return { chordKey: selectedKey, fret: capoFret };

    const chordKeyIndex = (selectedKeyIndex - capoFret + activeKeys.length) % activeKeys.length;
    return { chordKey: activeKeys[chordKeyIndex] ?? selectedKey, fret: capoFret };
  }, [activeKeys, capoFret, guitarMode, selectedKey, selectedKeyIndex]);

  const displayKey = capoData?.chordKey ?? selectedKey;
  
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
      <div className="flex items-center justify-between px-2 md:px-6 py-3 md:py-4 bg-zinc-950 border-b border-white/10 shrink-0 overflow-x-auto no-scrollbar gap-4 md:gap-8">
        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <Link href={`/setlists/${setlist.id}`} className="p-2 rounded-full hover:bg-white/10 transition">
            <X className="size-5 md:size-6 text-zinc-400" />
          </Link>
          <div className="flex flex-col justify-center">
            <h1 className="text-base md:text-xl font-bold flex items-center gap-2">
               <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{currentSong.title}</span>
               {guitarMode && (
                 <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                   {capoFret === 0 ? "Open" : `Capo ${capoFret}`}
                 </span>
               )}
            </h1>
            <div className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1 flex flex-col gap-1">
              <span>{currentSong.bpm || 70} BPM</span>
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
             <button onClick={() => changeKey(-1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white">
               <Minus className="size-4" />
             </button>
             <span className="w-12 text-center font-bold text-lg">{selectedKey}</span>
             <button onClick={() => changeKey(1)} className="p-2 hover:bg-white/10 rounded transition text-zinc-400 hover:text-white">
               <Plus className="size-4" />
             </button>
           </div>

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
           
           {/* Guitar Mode (Capo) */}
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
           
           {/* Draw Mode */}
           <div className="flex items-center gap-2">
             {drawMode && (
               <div className="flex items-center gap-1 bg-white/5 rounded-lg border border-white/10 p-1 mr-2 animate-in fade-in slide-in-from-right-4 duration-300">
                 <button 
                   onClick={() => setPenTool("pen")}
                   className={cn("p-2 rounded transition", penTool === "pen" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-400 hover:text-white")}
                 >
                   <PenTool className="size-4" />
                 </button>
                 <button 
                   onClick={() => setPenTool("eraser")}
                   className={cn("p-2 rounded transition", penTool === "eraser" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-400 hover:text-white")}
                 >
                   <Eraser className="size-4" />
                 </button>
                 <div className="w-px h-4 bg-white/10 mx-1" />
                 <div className="flex items-center gap-1" role="group" aria-label="Annotation colors">
                   {ANNOTATION_COLORS.map((color) => (
                     <button
                       key={color.name}
                       type="button"
                       aria-label={`Draw with ${color.name}`}
                       aria-pressed={penTool === "pen" && penColor === color.value}
                       onClick={() => {
                         setPenColor(color.value);
                         setPenTool("pen");
                       }}
                       className={cn(
                         "size-7 rounded-full border-2 transition hover:scale-110",
                         penTool === "pen" && penColor === color.value ? "border-violet-300 ring-2 ring-violet-500/50" : "border-white/20",
                       )}
                       style={{ backgroundColor: color.value }}
                     />
                   ))}
                 </div>
                 <div className="w-px h-4 bg-white/10 mx-1" />
                 <input 
                   aria-label="Annotation brush size"
                   type="range" 
                   min="2" 
                   max="50" 
                   value={penSize} 
                   onChange={(e) => setPenSize(Number(e.target.value))}
                   className="w-20 mx-2 accent-emerald-500"
                 />
                 <div className="flex items-center justify-center w-[50px] h-10">
                   <div 
                     className="rounded-full transition-all duration-75"
                     style={{ 
                       width: penTool === "eraser" ? penSize * 4 : penSize, 
                       height: penTool === "eraser" ? penSize * 4 : penSize,
                       maxWidth: "40px",
                       maxHeight: "40px",
                       backgroundColor: penTool === "eraser" ? "rgba(255,255,255,0.35)" : penColor,
                     }}
                   />
                 </div>
                 {annotationSaveStatus ? (
                   <span className={cn("whitespace-nowrap px-2 text-[10px] font-bold", annotationSaveStatus === "saved" ? "text-emerald-300" : "text-red-300")} role="status">
                     {annotationSaveStatus === "saved" ? "Saved on this device" : "Could not save drawing"}
                   </span>
                 ) : null}
               </div>
             )}
             <button 
               onClick={() => setDrawMode(!drawMode)}
               aria-label="Draw annotations"
               aria-pressed={drawMode}
               className={cn("p-3 rounded-lg transition border h-11 flex items-center justify-center", drawMode ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
               title="Draw annotations"
             >
               <PenTool className="size-5" />
             </button>
           </div>
           
           <div className="w-px h-8 bg-white/10 mx-2" />
           
           {/* Navigation */}
           <div className="flex items-center gap-1 md:gap-2 shrink-0">
             <button onClick={() => currentSongIndex > 0 && setSyncedSongIndex(i => i - 1)} disabled={currentSongIndex === 0} className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition">
               <ChevronLeft className="size-5 md:size-6" />
             </button>
             <span className="text-xs md:text-sm font-bold text-zinc-500 w-8 md:w-12 text-center">
               {currentSongIndex + 1} / {setlist.songs.length}
             </span>
             <button onClick={() => currentSongIndex < setlist.songs.length - 1 && setSyncedSongIndex(i => i + 1)} disabled={currentSongIndex === setlist.songs.length - 1} className="p-2 md:p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition">
               <ChevronRight className="size-5 md:size-6" />
             </button>
           </div>
        </div>
      </div>

      {/* Arrangement Blocks (Desktop) */}
      <div className="hidden md:flex items-center gap-2 px-6 py-3 bg-zinc-900 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
        {displayedSections.map((section, idx) => {
          if (!section.label || section.label === "unknown") return null;
          
          const colorClass = getSectionLabelColor(section.label);
          
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

      <div className="flex-1 flex overflow-hidden">
        {/* Chord Chart Area */}
        <div 
          ref={scrollRef} 
          style={{ "--user-font-scale": fontScale } as FontScaleStyle}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-10 pb-64 relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerOut={stopDrawing}
          className={cn(
            "absolute top-0 left-0 z-20",
            drawMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
          )}
        />
        
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
          {displayedSections.map((section, idx) => (
            <div key={idx} id={`section-${idx}`} className="space-y-3 scroll-mt-6">
              {section.label && section.label !== "unknown" && (
                <div className={cn(
                  "inline-block rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider",
                  getSectionLabelColor(section.label),
                )}>
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
        {displayedSections.map((section, idx) => {
          if (!section.label || section.label === "unknown") return null;
          
          const colorClass = getSectionLabelColor(section.label);
          
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
      </div>
    </div>
  );
}
