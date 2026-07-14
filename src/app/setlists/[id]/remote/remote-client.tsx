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
  
  // State for the currently viewed song on the remote
  const [activeSongIndex, setActiveSongIndex] = useState(0);
  const activeSong = setlist.songs[activeSongIndex];

  const supabase = useMemo(() => createClient(), []);
  const channel = useMemo(() => supabase.channel(`setlist_${setlist.id}`), [setlist.id, supabase]);

  // Derived slides for the active song
  const songSlides = useMemo(() => {
    if (!activeSong) return [];
    return generateSongSlides(activeSong.song.lyricsChords, 4);
  }, [activeSong]);

  // Derived sections for the left and middle column
  const sections = useMemo(() => {
    if (!activeSong) return [];
    return parseLyricsAndChords(activeSong.song.lyricsChords);
  }, [activeSong]);

  // Handle connection
  useEffect(() => {
    if (isServerActive) {
      channel
        .on("broadcast", { event: "projector_sync" }, (payload: any) => {
          setActiveSlide(payload.payload.slide || null);
        })
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
        });
    } else {
      channel.unsubscribe();
      setIsConnected(false);
    }

    return () => {
      channel.unsubscribe();
    };
  }, [isServerActive, channel]);

  const toggleServer = () => {
    setIsServerActive(!isServerActive);
  };

  const sendSlide = (slide: PresentationSlide) => {
    if (!isServerActive) return;
    setActiveSlide(slide);
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { slide },
    });
  };

  const jumpToSection = (label: string) => {
    if (!label) return;
    // Find the first slide with this section label
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

  // Keyboard shortcut mapping for sections (Q, W, E, R, T, Y...)
  const shortcutKeys = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];

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
          
          {/* Connection Status */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#111]">
            <div className="flex items-center gap-2">
              <div className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600")} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {isConnected ? "SERVER ONLINE" : "SERVER OFFLINE"}
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
              {isServerActive ? "Stop Server" : "Start Server"}
            </button>
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
                    return (
                      <div key={idx} className="space-y-2">
                        {section.label && section.label !== "unknown" && (
                          <span className="inline-block px-2 py-1 rounded bg-white/10 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                            {section.label}
                          </span>
                        )}
                        <div className="space-y-3">
                           {section.lines.map((line: any, lIdx: number) => (
                             <div key={lIdx} className="leading-tight">
                                {line.chords && <div className="text-[#3b82f6] font-mono font-bold text-sm whitespace-pre">{line.chords}</div>}
                                {line.lyric && <div className="text-zinc-400 font-semibold text-base">{line.lyric}</div>}
                             </div>
                           ))}
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
          <div className="h-16 shrink-0 bg-[#111] border-b border-white/10 flex flex-col items-center justify-center px-4 text-center">
             <h3 className="font-bold text-white text-base leading-tight truncate w-full">{activeSong?.song.title || "No Song"}</h3>
             <p className="text-xs font-semibold text-zinc-500 truncate w-full">Worship Leader</p>
          </div>
          
          {/* Quick Controls */}
          <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/10 shrink-0">
            <div className="bg-[#111] p-3 flex flex-col items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider">Key</span>
              <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-full border border-white/5 w-full">
                <button className="p-1 hover:bg-white/5 rounded-full text-zinc-400"><Minus className="size-3" /></button>
                <span className="flex-1 text-center font-bold text-xs text-white">{activeSong?.song.originalKey || "C"}</span>
                <button className="p-1 hover:bg-white/5 rounded-full text-zinc-400"><Plus className="size-3" /></button>
              </div>
            </div>
            <div className="bg-[#111] p-3 flex flex-col items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase text-zinc-500 tracking-wider">BPM</span>
              <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-full border border-white/5 w-full">
                <button className="p-1 hover:bg-white/5 rounded-full text-zinc-400"><Play className="size-3" /></button>
                <span className="flex-1 text-center font-bold text-xs text-white">{activeSong?.song.bpm || "70"} BPM</span>
                <button className="p-1 hover:bg-white/5 rounded-full text-zinc-600"><Circle className="size-3 fill-current" /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#111]">
             {/* Dynamic Section Buttons based on current song */}
             <button 
                onClick={() => jumpToSection("Title")}
                className="w-full flex items-center gap-3 bg-[#1a1a1a] hover:bg-[#222] border border-white/5 rounded-lg p-2 transition group"
              >
                <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:text-white">Q</div>
                <span className="font-bold text-sm text-white flex-1 text-center pr-8">Title</span>
              </button>
              
             {sections.filter((s: any) => s.label && s.label !== "unknown").map((section: any, idx: number) => {
                const key = shortcutKeys[(idx + 1) % shortcutKeys.length];
                return (
                  <button 
                    key={idx}
                    onClick={() => jumpToSection(section.label)}
                    className="w-full flex items-center gap-3 bg-[#1a1a1a] hover:bg-[#222] border border-white/5 rounded-lg p-2 transition group"
                  >
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-xs font-bold text-zinc-400 group-hover:text-white">{key}</div>
                    <span className="font-bold text-sm text-white flex-1 text-center pr-8">{section.label}</span>
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
          <div className="p-4 border-b border-white/10 h-16 shrink-0 bg-[#1a1a1a]">
            <h2 className="text-lg font-black text-white tracking-tight">Projector</h2>
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
