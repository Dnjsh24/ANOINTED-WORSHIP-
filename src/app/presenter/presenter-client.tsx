"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { X, Play, Music, LayoutTemplate, MonitorUp, EyeOff, Settings, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Smartphone, Type } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, defaultPresentationSettings, type PresentationSlide, type PresentationSettings, type SlideBlock } from "@/lib/domain/presentation";
import KineticCanvas from "./kinetic-canvas";
import TimelineEditor from "./timeline-editor";

export default function GlobalPresenterClient({ setlists }: { setlists: any[] }) {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>(setlists[0]?.id || "");
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(4);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"Property" | "Layers" | "Motion">("Property");
  
  // Presentation Settings
  const [settings, setSettings] = useState<PresentationSettings>(defaultPresentationSettings);
  
  // Store customized blocks for slides (Slide ID -> Array of Blocks)
  const [slideOverrides, setSlideOverrides] = useState<Record<string, SlideBlock[]>>({});

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
    
    // Construct the active slide payload including any block overrides
    const activeSlidePayload = activeSlideId ? { 
      id: activeSlideId,
      blocks: slideOverrides[activeSlideId]
    } : null;
    
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { 
        settings, 
        slide: activeSlidePayload
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, channel, slideOverrides]); // Adding slideOverrides so block drags sync in real-time

  const pushToProjector = (slide: PresentationSlide | null) => {
    setActiveSlideId(slide?.id || null);
    
    if (slide) {
       // Attach any existing block overrides to the payload
       slide.blocks = slideOverrides[slide.id];
    }
    
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

  const activeSlide = useMemo(() => slides.find(s => s.id === activeSlideId), [slides, activeSlideId]);
  const activeBlocks = activeSlideId ? slideOverrides[activeSlideId] || [] : [];

  const handleUpdateBlock = (blockId: string, updates: Partial<SlideBlock>) => {
    if (!activeSlideId) return;
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || [];
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
      };
    });
  };

  const handleChopToWords = () => {
    if (!activeSlide) return;
    
    // If we already have blocks, skip
    if (activeBlocks.length > 0) return;
    
    // Split lyrics into words
    const allWords = activeSlide.content.join(" ").split(/\s+/).filter(Boolean);
    
    const newBlocks: SlideBlock[] = allWords.map((word, idx) => {
      // Scatter randomly or grid layout. Let's do a simple scattered layout
      const x = 20 + Math.random() * 60; // 20% to 80%
      const y = 20 + Math.random() * 60; // 20% to 80%
      
      // Sequential start times, 0.5s apart
      const startTime = idx * 0.5;
      
      return {
        id: `block-${idx}-${Date.now()}`,
        text: word,
        x,
        y,
        startTime,
        duration: 2 // 2s duration default
      };
    });
    
    setSlideOverrides(prev => ({
      ...prev,
      [activeSlide.id]: newBlocks
    }));
  };

  const handleResetBlocks = () => {
    if (!activeSlideId) return;
    setSlideOverrides(prev => {
      const next = { ...prev };
      delete next[activeSlideId];
      return next;
    });
  };

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
        
        {/* Far Left Nav (Icons) */}
        <div className="w-14 border-r border-white/5 bg-[#0a0a0a] flex flex-col items-center py-4 gap-4 shrink-0 z-10">
           <button className="p-2 rounded-lg bg-violet-600/20 text-violet-400"><LayoutTemplate className="size-5" /></button>
           <button className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300"><Music className="size-5" /></button>
           <button className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300"><Settings className="size-5" /></button>
        </div>

        {/* Keynotes Sidebar: Line up */}
        <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col shrink-0">
          <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0">
             <button className="text-xs font-bold pb-2 border-b-2 text-white border-white">Line up</button>
             <button className="text-xs font-bold pb-2 border-b-2 text-zinc-600 border-transparent hover:text-zinc-400">Notes</button>
          </div>
          
          <div className="p-2 flex gap-2 border-b border-white/5 bg-[#0a0a0a]">
             <button className="flex-1 flex items-center justify-center gap-2 py-1.5 bg-[#18181b] border border-white/10 rounded text-xs font-bold text-zinc-300"><Music className="size-3"/> Song</button>
             <button className="flex-1 flex items-center justify-center gap-2 py-1.5 hover:bg-white/5 border border-transparent rounded text-xs font-bold text-zinc-500 hover:text-zinc-300"><LayoutTemplate className="size-3"/> Worship</button>
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
                {/* Thumbnail placeholder */}
                <div className="size-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                   <Music className="size-4" />
                </div>
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
                  <div className="size-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                     <LayoutTemplate className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white">Media Viewer</p>
                    <p className="text-xs font-semibold opacity-70 truncate">PDF / Image</p>
                  </div>
               </button>
            </div>
          </div>
        </div>

        {/* Lyrics Reflow (Slides) */}
        {activeItemIndex !== -1 && (
           <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col shrink-0">
              <div className="h-14 border-b border-white/5 flex flex-col justify-center px-4 shrink-0 bg-[#18181b]">
                 <span className="text-xs font-bold text-white truncate">{activeItem?.song.title}</span>
                 <span className="text-[10px] font-semibold text-zinc-500">Lyrics Reflow</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                          "w-full relative rounded-lg overflow-hidden flex flex-col text-left transition-all duration-200 group bg-zinc-900 border-2",
                          isActive ? "border-amber-400 ring-2 ring-amber-400/20" : borderColorClass,
                          !isActive && "hover:border-zinc-500"
                        )}
                      >
                        {slide.sectionLabel && (
                          <div className="bg-black/40 px-2 py-1 border-b border-white/5 flex items-center gap-2">
                             <div className="size-4 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white font-bold">{slide.sectionLabel.charAt(0)}</div>
                            <span className="text-[10px] font-bold text-blue-400 truncate">
                              {slide.sectionLabel}
                            </span>
                          </div>
                        )}
                        <div className="p-3">
                          {slide.content.map((line, i) => (
                            <p key={i} className="text-[11px] font-semibold text-zinc-300 leading-tight">
                              {line}
                            </p>
                          ))}
                        </div>
                      </button>
                    );
                  })}
              </div>
           </div>
        )}

        {/* Center: Canvas & Timeline */}
        <div className="flex-1 flex flex-col bg-[#0f0f11] overflow-hidden">
          {activeItemIndex === -1 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
               <div className="max-w-md w-full space-y-6">
                 <LayoutTemplate className="size-16 text-emerald-500/50 mx-auto" />
                 <h2 className="text-2xl font-bold text-white">Media & Teaching</h2>
                 <p className="text-sm text-zinc-400">
                   Paste a URL to an image or PDF to display it on the projector.
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
               {/* Center Canvas Area */}
               <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
                  {activeSlideId ? (
                     <KineticCanvas 
                       blocks={activeBlocks} 
                       settings={settings} 
                       onUpdateBlock={handleUpdateBlock} 
                     />
                  ) : (
                     <div className="text-zinc-600 font-bold">Select a slide to edit</div>
                  )}
                  
                  {/* Floating properties quick toggle (optional) */}
                  <div className="absolute top-4 left-4 flex gap-2">
                     <button className="bg-black/50 border border-white/10 p-2 rounded hover:bg-white/10 transition"><MonitorUp className="size-4 text-zinc-400"/></button>
                  </div>
               </div>

               {/* Bottom Timeline */}
               <TimelineEditor 
                 blocks={activeBlocks} 
                 onUpdateBlock={handleUpdateBlock}
                 onChopToWords={handleChopToWords}
                 onReset={handleResetBlocks}
               />
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
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-[10px] font-bold uppercase text-zinc-500">Global Song Properties</p>
                       <button className="text-[10px] font-bold text-rose-500 hover:text-rose-400">Reset to Default</button>
                    </div>
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
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Character</p>
                     
                     <div className="space-y-2">
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                         value={settings.fontFamily}
                         onChange={(e) => setSettings({...settings, fontFamily: e.target.value})}
                       >
                         <option value="Arial">Arial</option>
                         <option value="Arial Black">Arial Black</option>
                         <option value="Bahnschrift">Bahnschrift</option>
                         <option value="Inter">Inter (Sans)</option>
                         <option value="Times New Roman">Times New Roman</option>
                         <option value="Courier New">Courier New</option>
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

                       <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden mt-2">
                         <button onClick={() => setSettings({...settings, bold: !settings.bold})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition border-r border-white/5", settings.bold && "bg-white/10 text-white")}><Bold className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, italic: !settings.italic})} className={cn("flex-1 py-1.5 flex items-center justify-center border-r border-white/5 hover:bg-white/5 transition", settings.italic && "bg-white/10 text-white")}><Italic className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, underline: !settings.underline})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", settings.underline && "bg-white/10 text-white")}><Underline className="size-4" /></button>
                       </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Paragraph Properties */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Paragraph</p>
                     <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden">
                         <button onClick={() => setSettings({...settings, align: 'left'})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition border-r border-white/5", settings.align === 'left' && "bg-white/10 text-white")}><AlignLeft className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'center'})} className={cn("flex-1 py-1.5 flex items-center justify-center border-r border-white/5 hover:bg-white/5 transition", settings.align === 'center' && "bg-white/10 text-white")}><AlignCenter className="size-4" /></button>
                         <button onClick={() => setSettings({...settings, align: 'right'})} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", settings.align === 'right' && "bg-white/10 text-white")}><AlignRight className="size-4" /></button>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Appearance Properties */}
                  <div className="space-y-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Appearance</p>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Color</span>
                       <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded border border-white/5">
                         {["#ffffff", "#e5e7eb", "#fcd34d", "#f87171", "#60a5fa", "#4ade80", "#fbbf24"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, color})}
                             className={cn("size-3 rounded-sm border border-white/20 transition-transform hover:scale-110", settings.color === color && "ring-1 ring-white")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>
                     
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-semibold text-zinc-400">Background</span>
                       <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded border border-white/5">
                         {["#000000", "#111827", "#312e81", "#14532d", "#7f1d1d"].map(color => (
                           <button 
                             key={color} 
                             onClick={() => setSettings({...settings, backgroundColor: color})}
                             className={cn("size-3 rounded-sm border border-white/20 transition-transform hover:scale-110", settings.backgroundColor === color && "ring-1 ring-white")}
                             style={{ backgroundColor: color }}
                           />
                         ))}
                       </div>
                     </div>

                     <div className="flex items-center justify-between pt-2">
                       <span className="text-xs font-semibold text-zinc-400">Drop Shadow</span>
                       <button 
                         onClick={() => setSettings({...settings, showShadow: !settings.showShadow})}
                         className={cn("w-8 h-4 rounded-full transition-colors flex items-center px-0.5", settings.showShadow ? "bg-white justify-end" : "bg-zinc-700 justify-start")}
                       >
                         <div className={cn("size-3 rounded-full shadow-sm", settings.showShadow ? "bg-black" : "bg-white")} />
                       </button>
                     </div>
                  </div>
                </div>
              )}

              {activeTab === "Layers" && (
                <div className="p-2 space-y-1">
                   {activeBlocks.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-500">
                         Click "Chop to Words" to see layers.
                      </div>
                   ) : (
                      activeBlocks.map((block) => (
                         <div key={block.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-[#1a1a1a] hover:bg-white/5 transition group">
                            <Type className="size-4 text-zinc-500 group-hover:text-zinc-300" />
                            <span className="text-sm font-bold text-zinc-300 truncate">{block.text}</span>
                         </div>
                      ))
                   )}
                </div>
              )}

              {activeTab === "Motion" && (
                <div className="p-4 space-y-6">
                  <div className="flex justify-between items-center mb-2">
                     <p className="text-[10px] font-bold uppercase text-zinc-500">Global Song Animation</p>
                     <button className="text-[10px] font-bold text-rose-500 hover:text-rose-400">Reset to Default</button>
                  </div>

                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Entrance Animation</p>
                     <p className="text-xs text-zinc-500">Effect</p>
                     <select 
                       className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                       value={settings.entranceAnimation}
                       onChange={(e) => setSettings({...settings, entranceAnimation: e.target.value as any})}
                     >
                       <option value="None">None</option>
                       <option value="Appear">Appear</option>
                       <option value="Fade In">Fade In</option>
                       <option value="Slide In Up">Slide In Up</option>
                       <option value="Slide In Down">Slide In Down</option>
                       <option value="Slide In Left">Slide In Left</option>
                       <option value="Slide In Right">Slide In Right</option>
                       <option value="Mask In Up">Mask In Up</option>
                     </select>
                  </div>

                  <hr className="border-white/5" />

                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Exit Animation</p>
                     <p className="text-xs text-zinc-500">Effect</p>
                     <select 
                       className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                       value={settings.exitAnimation}
                       onChange={(e) => setSettings({...settings, exitAnimation: e.target.value as any})}
                     >
                       <option value="None">None</option>
                       <option value="Disappear">Disappear</option>
                       <option value="Fade Out">Fade Out</option>
                       <option value="Slide Out Up">Slide Out Up</option>
                       <option value="Slide Out Down">Slide Out Down</option>
                       <option value="Slide Out Left">Slide Out Left</option>
                       <option value="Slide Out Right">Slide Out Right</option>
                       <option value="Mask Out Up">Mask Out Up</option>
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
