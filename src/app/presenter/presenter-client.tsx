"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { X, Play, Music, LayoutTemplate, MonitorUp, EyeOff, Settings, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, defaultPresentationSettings, type PresentationSlide, type PresentationSettings } from "@/lib/domain/presentation";

export default function GlobalPresenterClient({ setlists }: { setlists: any[] }) {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>(setlists[0]?.id || "");
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(4);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"Property" | "Layers" | "Motion">("Property");
  
  // Presentation Settings
  const [settings, setSettings] = useState<PresentationSettings>(defaultPresentationSettings);

  const setlist = useMemo(() => setlists.find(s => s.id === selectedSetlistId) || setlists[0], [selectedSetlistId, setlists]);
  
  const supabase = useMemo(() => createClient(), []);
  const channel = useMemo(() => supabase.channel(`setlist_${setlist?.id}`), [setlist?.id, supabase]);

  useEffect(() => {
    if (!setlist) return;
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channel, supabase, setlist]);

  // Sync settings when they change, even if slide doesn't change
  useEffect(() => {
    if (!setlist) return;
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { 
        settings, 
        slide: activeSlideId ? { id: activeSlideId } : null // We might need full slide object here, but projector keeps active slide state hopefully. Wait, projector just replaces state. We need to pass the full active slide. Let's rely on pushToProjector for slide changes, and here just push settings. 
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, channel]);

  const pushToProjector = (slide: PresentationSlide | null) => {
    setActiveSlideId(slide?.id || null);
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { slide, settings },
    });
  };

  const activeItem = setlist?.songs[activeItemIndex];
  
  const slides = useMemo(() => {
    if (!activeItem) return [];
    return generateSongSlides(activeItem.song.lyricsChords, linesPerSlide);
  }, [activeItem, linesPerSlide]);

  if (!setlist) {
    return <div className="p-8 text-white">No upcoming setlists found.</div>;
  }

  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0A] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <div className="h-14 border-b border-white/10 bg-[#121212] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-white">
            <X className="size-5" />
          </Link>
          <div className="flex items-center gap-3">
             <span className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Presenter</span>
             <select 
               value={selectedSetlistId} 
               onChange={(e) => {
                  setSelectedSetlistId(e.target.value);
                  setActiveItemIndex(0);
                  pushToProjector(null);
               }}
               className="bg-[#1a1a1a] border border-white/10 text-white text-sm font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-500"
             >
                {setlists.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({new Date(s.date).toLocaleDateString()})</option>
                ))}
             </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Link 
            href={`/setlists/${setlist.id}/remote`}
            target="_blank"
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold transition text-zinc-300"
          >
            <Smartphone className="size-4" />
            Worship Remote
          </Link>
          <button 
            onClick={() => pushToProjector(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold transition text-amber-400 hover:text-amber-300 ml-4"
          >
            <EyeOff className="size-4" />
            Clear Screen
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Line up */}
        <div className="w-64 border-r border-white/10 bg-[#121212] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
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
                          payload: { 
                            slide: { id: "media-url", type: "teaching", content: [], mediaUrl },
                            settings
                          },
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
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-white">{activeItem?.song.title}</h2>
                  <span className="text-xs font-semibold text-zinc-500 bg-black/50 px-2 py-1 rounded">
                    {slides.length} Slides
                  </span>
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
                        {slide.sectionLabel && (
                          <div className="absolute top-0 left-0 right-0 bg-black/40 px-2 py-1 border-b border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                              {slide.sectionLabel}
                            </span>
                          </div>
                        )}
                        
                        <div className="flex-1 flex flex-col items-center justify-center p-3 mt-6">
                          {slide.content.map((line, i) => (
                            <p key={i} className="text-[11px] font-semibold text-center text-zinc-300 leading-tight">
                              {line}
                            </p>
                          ))}
                        </div>

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

        {/* Right Sidebar: Properties & Motion */}
        <div className="w-[300px] border-l border-white/10 bg-[#121212] flex flex-col shrink-0">
           {/* Tabs */}
           <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0">
             {["Property", "Layers", "Motion"].map(tab => (
               <button 
                 key={tab}
                 onClick={() => setActiveTab(tab as any)}
                 className={cn(
                   "text-xs font-bold pb-2 border-b-2 transition-colors",
                   activeTab === tab ? "text-white border-white" : "text-zinc-600 border-transparent hover:text-zinc-400"
                 )}
               >
                 {tab}
               </button>
             ))}
           </div>
           
           <div className="flex-1 overflow-y-auto">
              {activeTab === "Property" && (
                <div className="p-4 space-y-6">
                  {/* Global Shortcut */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2">Global Appearance</p>
                    <Link 
                      href={`/setlists/${setlist.id}/projector`}
                      target="_blank"
                      className="flex items-center justify-center gap-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition"
                    >
                      <MonitorUp className="size-4" /> Open Projector Window
                    </Link>
                  </div>

                  <hr className="border-white/5" />

                  {/* Character Properties */}
                  <div className="space-y-4">
                     <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Character</p>
                     
                     <div className="space-y-2">
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
                         value={settings.fontFamily}
                         onChange={(e) => setSettings({...settings, fontFamily: e.target.value})}
                       >
                         <option value="Inter">Inter (Sans)</option>
                         <option value="Arial">Arial</option>
                         <option value="Times New Roman">Times New Roman (Serif)</option>
                         <option value="Courier New">Courier New (Mono)</option>
                         <option value="Georgia">Georgia</option>
                       </select>
                       
                       <div className="flex gap-2">
                         <div className="flex-1 flex items-center bg-[#1a1a1a] border border-white/10 rounded px-2">
                            <input 
                              type="number" 
                              value={settings.fontSize} 
                              onChange={(e) => setSettings({...settings, fontSize: Number(e.target.value)})}
                              className="w-full bg-transparent text-white text-sm py-1.5 focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500 font-bold ml-2">pt</span>
                         </div>
                       </div>

                       <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden">
                         <button onClick={() => setSettings({...settings, bold: !settings.bold})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", settings.bold && "bg-white/10 text-white")}><Bold className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, italic: !settings.italic})} className={cn("flex-1 py-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/5 transition", settings.italic && "bg-white/10 text-white")}><Italic className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, underline: !settings.underline})} className={cn("flex-1 py-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/5 transition", settings.underline && "bg-white/10 text-white")}><Underline className="size-4" /></button>
                       </div>
                     </div>
                  </div>

                  {/* Paragraph Properties */}
                  <div className="space-y-4">
                     <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Paragraph</p>
                     <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden">
                         <button onClick={() => setSettings({...settings, align: 'left'})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", settings.align === 'left' && "bg-white/10 text-white")}><AlignLeft className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'center'})} className={cn("flex-1 py-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/5 transition", settings.align === 'center' && "bg-white/10 text-white")}><AlignCenter className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'right'})} className={cn("flex-1 py-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/5 transition", settings.align === 'right' && "bg-white/10 text-white")}><AlignRight className="size-4" /></button>
                     </div>
                  </div>

                  {/* Appearance Properties */}
                  <div className="space-y-4">
                     <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Appearance</p>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Text Color</span>
                       <div className="flex gap-1">
                         {["#ffffff", "#e5e7eb", "#fcd34d", "#6ee7b7", "#93c5fd", "#fca5a5"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, color})}
                             className={cn("size-4 rounded-full border border-white/20", settings.color === color && "ring-2 ring-white ring-offset-1 ring-offset-[#121212]")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Background</span>
                       <div className="flex gap-1">
                         {["#000000", "#111827", "#312e81", "#14532d", "#7f1d1d"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, backgroundColor: color})}
                             className={cn("size-4 rounded-full border border-white/20", settings.backgroundColor === color && "ring-2 ring-white ring-offset-1 ring-offset-[#121212]")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>

                     <div className="flex items-center justify-between pt-2">
                       <span className="text-xs font-semibold text-zinc-400">Drop Shadow</span>
                       <button 
                         onClick={() => setSettings({...settings, showShadow: !settings.showShadow})}
                         className={cn("w-8 h-4 rounded-full transition-colors flex items-center px-0.5", settings.showShadow ? "bg-emerald-500 justify-end" : "bg-zinc-700 justify-start")}
                       >
                         <div className="size-3 bg-white rounded-full shadow-sm" />
                       </button>
                     </div>
                  </div>
                </div>
              )}

              {activeTab === "Layers" && (
                <div className="p-8 text-center text-sm font-semibold text-zinc-500">
                  <p>Layer management coming soon.</p>
                </div>
              )}

              {activeTab === "Motion" && (
                <div className="p-4 space-y-6">
                  <div className="space-y-4">
                     <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Entrance Animation</p>
                     <select 
                       className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                       value={settings.entranceAnimation}
                       onChange={(e) => setSettings({...settings, entranceAnimation: e.target.value as any})}
                     >
                       <option value="none">None</option>
                       <option value="fade">Fade In</option>
                       <option value="slide-up">Slide Up</option>
                       <option value="zoom-in">Zoom In</option>
                     </select>
                  </div>

                  <div className="space-y-4">
                     <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Exit Animation</p>
                     <select 
                       className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                       value={settings.exitAnimation}
                       onChange={(e) => setSettings({...settings, exitAnimation: e.target.value as any})}
                     >
                       <option value="none">None</option>
                       <option value="fade">Fade Out</option>
                       <option value="slide-down">Slide Down</option>
                       <option value="zoom-out">Zoom Out</option>
                     </select>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
