"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { X, Play, Music, LayoutTemplate, Settings, MonitorUp, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, type PresentationSlide } from "@/lib/domain/presentation";

import { SlideBackgroundPicker } from "@/components/slide-background-picker";

export default function PresenterClient({ setlist, teamId }: { setlist: any, teamId: string }) {
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(4);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  
  const supabase = useMemo(() => createClient(), []);
  const channel = useMemo(() => supabase.channel(`setlist_${setlist.id}`), [setlist.id, supabase]);

  useEffect(() => {
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channel, supabase]);

  const pushToProjector = (slide: PresentationSlide | null) => {
    setActiveSlideId(slide?.id || null);
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { slide, slideSettings: activeItem?.slideSettings || null },
    });
  };

  const activeItem = setlist.songs[activeItemIndex];
  
  const slides = useMemo(() => {
    if (!activeItem) return [];
    return generateSongSlides(activeItem.song.lyricsChords, linesPerSlide);
  }, [activeItem, linesPerSlide]);

  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0A] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <div className="h-14 border-b border-white/10 bg-[#121212] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/setlists/${setlist.id}`} className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white">
            <X className="size-5" />
          </Link>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Presenter</span>
            <span className="text-sm font-bold text-white">{setlist.name}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => pushToProjector(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold transition text-amber-400 hover:text-amber-300"
          >
            <EyeOff className="size-4" />
            Clear Screen
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Line up */}
        <div className="w-64 border-r border-white/10 bg-[#121212] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">Line Up</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {setlist.songs.map((item: any, idx: number) => (
              <button
                key={item.id}
                onClick={() => setActiveItemIndex(idx)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                  activeItemIndex === idx 
                    ? "bg-violet-600/20 text-violet-300 border border-violet-500/30" 
                    : "hover:bg-white/5 text-zinc-400 border border-transparent"
                )}
              >
                <Music className="size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate text-white">{item.song.title}</p>
                  <p className="text-xs font-semibold opacity-70 truncate">{item.song.originalKey}</p>
                </div>
              </button>
            ))}
            
            <div className="pt-4 mt-4 border-t border-white/5">
               <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-3 mb-2">Teaching & Media</h3>
               <button
                  onClick={() => setActiveItemIndex(-1)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors",
                    activeItemIndex === -1 
                      ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30" 
                      : "hover:bg-white/5 text-zinc-400 border border-transparent"
                  )}
               >
                  <LayoutTemplate className="size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white">Media Viewer</p>
                    <p className="text-xs font-semibold opacity-70 truncate">PDF / Image</p>
                  </div>
               </button>
            </div>
          </div>
        </div>

        {/* Center: Slide Grid or Media Viewer */}
        <div className="flex-1 flex flex-col bg-[#0f0f11] overflow-hidden">
          {activeItemIndex === -1 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
               <div className="max-w-md w-full space-y-6">
                 <LayoutTemplate className="size-16 text-emerald-500/50 mx-auto" />
                 <h2 className="text-2xl font-bold text-white">Media & Teaching</h2>
                 <p className="text-sm text-zinc-400">
                   Paste a URL to an image or PDF to display it on the projector. For PowerPoint (PPT), please export your slides to PDF first.
                 </p>
                 <div className="flex flex-col gap-3">
                   <input 
                     type="text" 
                     placeholder="https://example.com/slide.jpg" 
                     className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                     value={mediaUrl}
                     onChange={(e) => setMediaUrl(e.target.value)}
                   />
                   <button 
                     onClick={() => {
                        setActiveSlideId("media-url");
                        channel.send({
                          type: "broadcast",
                          event: "projector_sync",
                          payload: { slide: { id: "media-url", type: "teaching", content: [], mediaUrl } },
                        });
                     }}
                     className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition"
                   >
                     Push to Projector
                   </button>
                 </div>
               </div>
            </div>
          ) : (
            <>
              {/* Editor Header */}
              <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-[#18181b]">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Music className="size-5 text-violet-400" />
                      {activeItem.song.title}
                    </h2>
                    <p className="text-sm font-semibold text-zinc-400 mt-1">
                      Key: {activeItem.assignedKey} • {activeItem.song.bpm} BPM
                    </p>
                  </div>
                  <div className="ml-auto">
                    <SlideBackgroundPicker 
                      setlistSongId={activeItem.id} 
                      teamId={teamId} 
                      initialSettings={activeItem.slideSettings} 
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-500">Lines per Slide:</span>
                  <div className="flex bg-black/50 rounded-lg p-1 border border-white/10">
                    {[2, 4, 6].map(num => (
                      <button
                        key={num}
                        onClick={() => setLinesPerSlide(num)}
                        className={cn(
                          "px-3 py-1 rounded text-xs font-bold transition",
                          linesPerSlide === num ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Slides */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {slides.map((slide) => {
                    const isActive = activeSlideId === slide.id;
                    
                    // Determine border color based on section label
                    let borderColorClass = "border-white/10";
                    const lbl = (slide.sectionLabel || "").toLowerCase();
                    if (lbl.includes("chorus")) borderColorClass = "border-blue-500/40";
                    else if (lbl.includes("verse")) borderColorClass = "border-emerald-500/40";
                    else if (lbl.includes("bridge")) borderColorClass = "border-rose-500/40";
                    
                    return (
                      <button
                        key={slide.id}
                        onClick={() => pushToProjector(slide)}
                        className={cn(
                          "relative aspect-video rounded-lg overflow-hidden flex flex-col text-left transition-all duration-200 group bg-zinc-900 border-2",
                          isActive ? "border-amber-400 ring-2 ring-amber-400/20 ring-offset-2 ring-offset-[#0f0f11]" : borderColorClass,
                          !isActive && "hover:border-zinc-500"
                        )}
                      >
                        {/* Section Label Badge */}
                        {slide.sectionLabel && (
                          <div className="absolute top-0 left-0 right-0 bg-black/40 px-2 py-1 border-b border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                              {slide.sectionLabel}
                            </span>
                          </div>
                        )}
                        
                        {/* Slide Content Preview */}
                        <div className="flex-1 flex flex-col items-center justify-center p-3 mt-6">
                          {slide.content.map((line, i) => (
                            <p key={i} className="text-[11px] font-semibold text-center text-zinc-300 leading-tight">
                              {line}
                            </p>
                          ))}
                        </div>

                        {/* Live Indicator overlay */}
                        {isActive && (
                          <div className="absolute inset-0 border-[3px] border-amber-400 pointer-events-none rounded-lg" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Sidebar: Properties (Placeholder for future) */}
        <div className="w-64 border-l border-white/10 bg-[#121212] flex flex-col shrink-0">
           <div className="p-4 border-b border-white/5 flex gap-4">
             <button className="text-xs font-bold text-white border-b-2 border-white pb-2">Property</button>
             <button className="text-xs font-bold text-zinc-600 hover:text-zinc-400 pb-2">Layers</button>
           </div>
           <div className="p-4 space-y-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Global Appearance</p>
                <div className="space-y-3">
                  <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex items-center gap-3">
                    <MonitorUp className="size-4 text-zinc-400" />
                    <span className="text-xs font-bold text-zinc-300">Projector View</span>
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Changes to slides are synced instantly via Realtime. Open the projector view on your secondary display.
                  </p>
                  <Link 
                    href={`/setlists/${setlist.id}/projector`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition"
                  >
                    Open Projector Window
                  </Link>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
