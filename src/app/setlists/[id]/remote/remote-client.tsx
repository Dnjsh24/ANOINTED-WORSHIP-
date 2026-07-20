"use client";

import { useState, useMemo, useEffect } from "react";
import { Music, Pin, Power, Minus, Plus, Play, Circle, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, PlaySquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, type PresentationSlide } from "@/lib/domain/presentation";
import { parseLyricsAndChords } from "@/lib/domain/chords";

export default function RemoteClient({ setlist }: { setlist: any }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isServerActive, setIsServerActive] = useState(false);
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(null);
  
  // Settings sync
  const [linesPerSlide, setLinesPerSlide] = useState<number>(setlist?.presentationSettings?.linesPerSlide || 4);
  
  // State for the currently viewed song on the remote
  const [activeSongIndex, setActiveSongIndex] = useState(0);
  const activeSong = setlist.songs[activeSongIndex];

  const supabase = useMemo(() => createClient(), []);
  const [channel, setChannel] = useState<any>(null);

  // Derived slides for the active song
  const songSlides = useMemo(() => {
    if (!activeSong) return [];
    return generateSongSlides(activeSong.song.lyricsChords, linesPerSlide);
  }, [activeSong, linesPerSlide]);

  // Derived sections for the left and middle column
  const sections = useMemo(() => {
    if (!activeSong) return [];
    return parseLyricsAndChords(activeSong.song.lyricsChords);
  }, [activeSong]);

  // Handle connection
  useEffect(() => {
    if (!isServerActive) {
      setIsConnected(false);
      setChannel(null);
      return;
    }

    const newChannel = supabase.channel(`setlist_${setlist.id}`);
    
    newChannel
      .on("broadcast", { event: "projector_sync" }, (payload: any) => {
        setActiveSlide(payload.payload.slide || null);
      })
      .on("broadcast", { event: "settings_sync" }, (payload: any) => {
        if (payload.payload.linesPerSlide) {
          setLinesPerSlide(payload.payload.linesPerSlide);
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });
      
    setChannel(newChannel);

    return () => {
      newChannel.unsubscribe();
      setIsConnected(false);
      setChannel(null);
    };
  }, [isServerActive, setlist.id, supabase]);

  const toggleServer = () => {
    setIsServerActive(!isServerActive);
  };

  const sendSlide = (slide: PresentationSlide) => {
    if (!isServerActive || !channel) return;
    
    // Attach custom blocks if they exist for this slide
    const slideOverrides = setlist?.presentationSettings?.slideOverrides || {};
    if (slideOverrides[slide.id]) {
      slide.blocks = slideOverrides[slide.id];
    }
    
    setActiveSlide(slide);
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { slide },
    });
  };

  const updateLinesPerSlide = (num: number) => {
    setLinesPerSlide(num);
    if (isServerActive && channel) {
      channel.send({
        type: "broadcast",
        event: "settings_sync",
        payload: { linesPerSlide: num },
      });
    }
  };

  const jumpToSection = (label: string) => {
    if (!label) return;
    const targetSlide = songSlides.find(s => s.sectionLabel === label);
    if (targetSlide) {
      sendSlide(targetSlide);
    }
  };

  const navigateSlide = (direction: 'next' | 'prev') => {
    if (!activeSlide || songSlides.length === 0) return;
    const currentIndex = songSlides.findIndex(s => s.id === activeSlide.id);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    if (direction === 'next' && currentIndex < songSlides.length - 1) newIndex++;
    if (direction === 'prev' && currentIndex > 0) newIndex--;

    if (newIndex !== currentIndex) {
      sendSlide(songSlides[newIndex]);
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#111111] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* Top Title Bar */}
      <div className="h-12 border-b border-white/10 bg-[#1a1a1a] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 text-zinc-400">
          <Music className="size-4" />
          <span className="text-sm font-bold text-white tracking-wide">Worship Remote</span>
        </div>
        <button className="text-zinc-500 hover:text-white transition">
          <Pin className="size-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Worship App (Local Slides / Teleprompter) */}
        <div className="flex-1 flex flex-col border-r border-white/10 bg-[#0a0a0a] min-w-[300px]">
          <div className="p-4 border-b border-white/10 flex items-center justify-between h-16 shrink-0 bg-[#111]">
            <div className="flex flex-col">
               <h2 className="text-lg font-black text-white tracking-tight leading-tight">Worship App</h2>
            </div>
          </div>
          

          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#0a0a0a]">
            {activeSong ? (
              <>
                 <div className="mb-4">
                    <span className="inline-block px-2 py-1 rounded bg-white/10 text-[10px] font-bold uppercase tracking-wider text-zinc-300 mb-2">Title</span>
                    <h1 className="text-2xl font-bold text-white">{activeSong.song.title}</h1>
                 </div>
                 {sections.map((section: any, idx: number) => {
                    if (section.label === "unknown" && section.lines.length === 0) return null;
                    
                    const validLines = section.lines.filter((l: any) => (l.lyric && l.lyric.trim()) || (l.chords && l.chords.trim()));
                    const chunks = [];
                    let currentChunk = [];
                    let lyricCount = 0;
                    
                    for (const line of validLines) {
                      currentChunk.push(line);
                      if (line.lyric && line.lyric.trim()) {
                        lyricCount++;
                      }
                      if (lyricCount === linesPerSlide) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                        lyricCount = 0;
                      }
                    }
                    if (currentChunk.length > 0) {
                      chunks.push(currentChunk);
                    }

                    return (
                      <div key={idx} className="space-y-2 mb-6">
                        {section.label && section.label !== "unknown" && (
                          <span className="inline-block px-2 py-1 rounded bg-white/10 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                            {section.label}
                          </span>
                        )}
                        <div className="space-y-1">
                           {chunks.map((chunk, cIdx) => {
                             const firstLyric = chunk.find((l: any) => l.lyric?.trim())?.lyric?.trim();
                             const targetSlide = firstLyric ? songSlides.find(s => s.content[0] === firstLyric) : null;
                             const isActive = targetSlide && activeSlide?.id === targetSlide.id;

                             return (
                               <button 
                                 key={cIdx} 
                                 onClick={() => {
                                   if (targetSlide) {
                                     sendSlide(targetSlide);
                                   } else {
                                     sendSlide({ id: `blank-${idx}-${cIdx}`, type: "blank", content: [] });
                                   }
                                 }}
                                 className={cn(
                                   "w-full text-left p-3 rounded-lg transition-colors border",
                                   isActive 
                                     ? "bg-amber-400/10 border-amber-400/50" 
                                     : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
                                 )}
                               >
                                 {chunk.map((line: any, lIdx: number) => (
                                   <div key={lIdx} className="leading-tight mb-1 last:mb-0">
                                      {line.chords && <div className="text-[#3b82f6] font-mono font-bold text-sm whitespace-pre">{line.chords}</div>}
                                      {line.lyric && <div className={cn("text-zinc-300 font-semibold text-base", line.chords && "font-mono")}>{line.lyric}</div>}
                                   </div>
                                 ))}
                               </button>
                             );
                           })}
                        </div>
                      </div>
                    );
                 })}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-semibold">
                No song selected.
              </div>
            )}
          </div>
        </div>

        {/* Middle Column: Controls */}
        <div className="w-[320px] border-r border-white/10 flex flex-col bg-[#111] shrink-0">
          <div className="h-16 shrink-0 bg-[#111] border-b border-white/10 flex items-center justify-between px-4">
             <div className="flex flex-col min-w-0 pr-2">
               <h3 className="font-black text-white text-base leading-tight truncate uppercase">{activeSong?.song.title || "No Song"}</h3>
               <p className="text-xs font-semibold text-zinc-500 truncate">Lyrics Reflow</p>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#111]">
             {songSlides.map((slide: PresentationSlide, idx: number) => {
                const isActive = activeSlide?.id === slide.id;
                const label = slide.sectionLabel || "Unknown";
                const initial = label.charAt(0).toUpperCase();
                
                // Colors based on section label (matching the requested image style)
                let colorClass = "text-[#3b82f6]"; 
                let bgClass = "bg-[#3b82f6]";
                let borderClass = "border-[#10b981]"; // Default to green border
                
                const lowerLabel = label.toLowerCase();
                if (lowerLabel.includes("verse")) {
                  borderClass = "border-[#10b981]"; // Green
                } else if (lowerLabel.includes("chorus")) {
                  borderClass = "border-[#3b82f6]"; // Blue
                } else if (lowerLabel.includes("intro") || lowerLabel.includes("instrumental") || lowerLabel.includes("intrumental")) {
                  borderClass = "border-[#8b5cf6]"; // Purple
                } else if (lowerLabel.includes("bridge")) {
                  borderClass = "border-[#eab308]"; // Yellow
                }
                
                return (
                  <button 
                    key={slide.id}
                    onClick={() => sendSlide(slide)}
                    className={cn(
                      "w-full flex flex-col rounded-lg overflow-hidden transition text-left border bg-[#18181b]",
                      isActive 
                        ? "ring-2 ring-white/30" 
                        : "hover:brightness-110",
                      borderClass
                    )}
                  >
                    {/* Card Header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 w-full border-b border-white/5">
                      <div className={cn("size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white", bgClass)}>
                        {initial}
                      </div>
                      <span className={cn("text-xs font-bold tracking-wide", colorClass)}>
                        {label}
                      </span>
                    </div>
                    
                    {/* Card Body */}
                    <div className="p-3 w-full">
                       {slide.content.map((line, lIdx) => (
                         <span key={lIdx} className={cn(
                           "text-sm font-bold block w-full leading-snug",
                           isActive ? "text-white" : "text-zinc-200"
                         )}>
                           {line || "(Instrumental)"}
                         </span>
                       ))}
                    </div>
                  </button>
                )
             })}
          </div>

          {/* Nav Controls */}
          <div className="p-3 bg-[#18181b] border-t border-white/10 flex items-center justify-center gap-2 shrink-0">
            <button className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5 text-white">
              <PlaySquare className="size-5" />
            </button>
            <button className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5 text-white">
              <ChevronsUp className="size-5" />
            </button>
            <button 
              onClick={() => navigateSlide('prev')}
              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5 text-white"
            >
              <ChevronUp className="size-5" />
            </button>
            <button 
              onClick={() => navigateSlide('next')}
              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5 text-white"
            >
              <ChevronDown className="size-5" />
            </button>
            <button className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5 text-white">
              <ChevronsDown className="size-5" />
            </button>
          </div>
        </div>

        {/* Right Column: Projector Preview */}
        <div className="flex-[1.5] flex flex-col bg-[#0f0f11]">
          <div className="px-4 border-b border-white/10 h-16 shrink-0 bg-[#1a1a1a] flex items-center justify-between">
            <h2 className="text-lg font-black text-white tracking-tight">Projector</h2>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600")} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {isConnected ? "PRESENTING" : "NOT PRESENTING"}
                </span>
              </div>
              <button 
                onClick={toggleServer}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition",
                  isServerActive ? "bg-white/10 text-white hover:bg-white/20" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                )}
              >
                <Power className="size-3" />
                {isServerActive ? "Stop Presenting" : "Start Presenting"}
              </button>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0a0a0a]">
            {activeSlide ? (
              <div className="flex flex-col items-center w-full max-w-2xl gap-3">
                 {activeSlide.sectionLabel && (
                   <div className="px-3 py-1 rounded bg-white/10 text-xs font-bold uppercase tracking-wider text-zinc-300">
                     {activeSlide.sectionLabel}
                   </div>
                 )}
                 <div className="aspect-video w-full bg-black border border-white/10 rounded-lg flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                    {activeSlide.content.map((line, idx) => (
                      <p key={idx} className="text-2xl font-bold text-white leading-tight">
                        {line}
                      </p>
                    ))}
                 </div>
              </div>
            ) : (
              <span className="text-sm font-semibold text-zinc-600">No slides.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
