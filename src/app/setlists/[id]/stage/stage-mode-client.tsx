"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Minus, Plus, Play, Square, PenTool, Radio, Eraser, Type, Guitar } from "lucide-react";
import { parseLyricsAndChords, transposeProgression, capoSuggestion } from "@/lib/domain/chords";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

let audioCtx: AudioContext | null = null;
function playClick(beat: number, volume: number = 0.5) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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

export default function StageModeClient({ setlist }: { setlist: any }) {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  const currentSetlistSong = setlist.songs[currentSongIndex];
  const currentSong = currentSetlistSong?.song;
  const rawLyrics = currentSong?.lyricsChords || "";
  const sections = parseLyricsAndChords(rawLyrics);

  const baseKey = currentSetlistSong?.assignedKey || currentSong?.originalKey || "C";
  const [selectedKey, setSelectedKey] = useState(baseKey);
  const [guitarMode, setGuitarMode] = useState(false);
  
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  const [fontScale, setFontScale] = useState(1);

  // --- Phase 4: Band Leader Sync ---
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const channel = useRef<any>(null);

  useEffect(() => {
    channel.current = supabase.channel(`setlist_${setlist.id}`)
      .on("broadcast", { event: "sync_song" }, (payload: any) => {
        if (!isBroadcasting && typeof payload.payload.index === "number") {
          setSyncedSongIndex(payload.payload.index);
        }
      })
      .on("broadcast", { event: "sync_section" }, (payload: any) => {
        if (!isBroadcasting && typeof payload.payload.sectionIndex === "number") {
          const el = document.getElementById(`section-${payload.payload.sectionIndex}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel.current); };
  }, [setlist.id, isBroadcasting, supabase]);

  // Broadcast to others when leader changes song
  const setSyncedSongIndex = (updater: number | ((i: number) => number)) => {
    setCurrentSongIndex((prev) => {
      const nextIdx = typeof updater === "function" ? updater(prev) : updater;
      if (isBroadcasting) {
        channel.current?.send({ type: "broadcast", event: "sync_song", payload: { index: nextIdx } });
      }
      return nextIdx;
    });
  };

  // --- Phase 4: Scribbles (Canvas) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penTool, setPenTool] = useState<"pen" | "eraser">("pen");
  const [penSize, setPenSize] = useState(4);

  // Load scribbles on song change
  useEffect(() => {
    if (!currentSong?.id || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Load from local storage (Free alternative to DB)
    const saved = localStorage.getItem(`scribbles_${setlist.id}_${currentSong.id}`);
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
  }, [currentSong?.id, setlist.id]);

  // Handle Resize of canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && scrollRef.current) {
         // Save current drawing
         const current = canvasRef.current.toDataURL();
         canvasRef.current.width = scrollRef.current.scrollWidth;
         canvasRef.current.height = scrollRef.current.scrollHeight;
         // Restore
         const img = new Image();
         img.onload = () => canvasRef.current?.getContext("2d")?.drawImage(img, 0, 0);
         img.src = current;
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const saveScribbles = () => {
    if (canvasRef.current && currentSong?.id) {
      localStorage.setItem(`scribbles_${setlist.id}_${currentSong.id}`, canvasRef.current.toDataURL());
    }
  };

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
    ctx.strokeStyle = penTool === "pen" ? "rgba(250, 204, 21, 0.8)" : "rgba(0,0,0,1)";
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

  const handleJumpToSection = (idx: number) => {
    const el = document.getElementById(`section-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    
    if (isBroadcasting && channel.current) {
      channel.current.send({ type: "broadcast", event: "sync_section", payload: { sectionIndex: idx } });
    }
  };

  // Reset when song changes
  useEffect(() => {
    setSelectedKey(currentSetlistSong?.assignedKey || currentSong?.originalKey || "C");
    setGuitarMode(false);
    setMetronomePlaying(false);
    setIsScrolling(false);
    if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [currentSongIndex, currentSetlistSong?.assignedKey, currentSong?.originalKey]);

  // Transpose Logic
  const isMinor = currentSong?.originalKey?.endsWith("m");
  const activeKeys = isMinor ? MINOR_KEYS : MAJOR_KEYS;
  const selectedKeyIndex = activeKeys.indexOf(selectedKey);

  function changeKey(direction: number) {
    if (selectedKeyIndex === -1) return;
    let nextIdx = (selectedKeyIndex + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    setSelectedKey(activeKeys[nextIdx]);
  }

  // Capo Logic (Guitar Mode)
  // Easiest guitar keys: G, C, D, A, E
  const EASY_GUITAR_KEYS = ["G", "C", "D", "A", "E"];
  
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
        if (!line.chords) return line;
        const newChords = line.chords.split(/([\s-]+)/).map(part => {
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
  const toggleAutoScroll = () => {
    if (isScrolling) {
      if (scrollAnimationFrameRef.current) cancelAnimationFrame(scrollAnimationFrameRef.current);
      setIsScrolling(false);
    } else {
      const bpm = currentSong?.bpm || 70;
      const pixelsPerFrame = (bpm / 60) * 0.3; 
      const scrollStep = () => {
        if (scrollRef.current) {
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
  };

  // Metronome Engine
  useEffect(() => {
    if (!metronomePlaying || !currentSong?.bpm) return;
    const intervalMs = (60 / currentSong.bpm) * 1000;
    
    let beat = 1;
    setCurrentBeat(beat);
    playClick(beat, 0.8);

    const timer = setInterval(() => {
      beat = beat === 4 ? 1 : beat + 1;
      setCurrentBeat(beat);
      playClick(beat, 0.8);
    }, intervalMs);

    return () => clearInterval(timer);
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
  }, [currentSongIndex, setlist.songs.length, isScrolling, currentSong?.bpm]);

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
               {guitarMode && capoData && (
                 <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] md:text-xs font-black tracking-widest uppercase border border-red-500/30 whitespace-nowrap">
                   Capo {capoData.fret}
                 </span>
               )}
            </h1>
            <p className="text-xs md:text-sm text-zinc-500 font-semibold leading-none mt-1">{currentSong.bpm || 70} BPM</p>
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
             onClick={() => setMetronomePlaying(!metronomePlaying)}
             className={cn("p-3 rounded-lg transition border", metronomePlaying ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
           >
             {metronomePlaying ? <Square className="size-5" /> : <Play className="size-5" />}
           </button>
           
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
                 <input 
                   type="range" 
                   min="2" 
                   max="50" 
                   value={penSize} 
                   onChange={(e) => setPenSize(Number(e.target.value))}
                   className="w-20 mx-2 accent-emerald-500"
                 />
                 <div className="flex items-center justify-center w-[50px] h-10">
                   <div 
                     className="rounded-full bg-emerald-500/80 transition-all duration-75"
                     style={{ 
                       width: penTool === "eraser" ? penSize * 4 : penSize, 
                       height: penTool === "eraser" ? penSize * 4 : penSize,
                       maxWidth: "40px",
                       maxHeight: "40px"
                     }}
                   />
                 </div>
               </div>
             )}
             <button 
               onClick={() => setDrawMode(!drawMode)}
               className={cn("p-3 rounded-lg transition border h-11 flex items-center justify-center", drawMode ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white")}
               title="Apple Pencil Annotations"
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

      <div className="flex-1 flex overflow-hidden">
        {/* Chord Chart Area */}
        <div 
          ref={scrollRef} 
          style={{ "--user-font-scale": fontScale } as any}
          className={cn("flex-1 overflow-y-auto px-4 md:px-8 py-10 pb-64 relative", drawMode ? "touch-none" : "touch-pan-y")}
        >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerOut={stopDrawing}
          className={cn(
            "absolute top-0 left-0 w-full h-full z-10 touch-none",
            drawMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"
          )}
        />
        
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
          {transposedSections.map((section, idx) => (
            <div key={idx} id={`section-${idx}`} className="space-y-3 scroll-mt-6">
              {section.label && section.label !== "unknown" && (
                <div className="inline-block px-3 py-1 rounded bg-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  {section.label}
                </div>
              )}
              <div className="space-y-4">
                {section.lines.map((line, lIdx) => (
                  <div key={lIdx} className="leading-relaxed">
                    {line.chords && (
                      <div 
                        className="font-mono font-bold text-violet-400 whitespace-pre leading-none text-[calc(1rem*var(--user-font-scale))] md:text-[calc(1.25rem*var(--user-font-scale))]"
                      >
                        {line.chords}
                      </div>
                    )}
                    {line.lyric && (
                      <div 
                        className="font-semibold text-zinc-100 whitespace-pre-wrap leading-tight mt-1 text-[calc(1.25rem*var(--user-font-scale))] md:text-[calc(1.5rem*var(--user-font-scale))]"
                      >
                        {line.lyric}
                      </div>
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
      </div>
    </div>
  );
}
