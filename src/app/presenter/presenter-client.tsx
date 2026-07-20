"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, Save, X, Play, Music, LayoutTemplate, MonitorUp, EyeOff, Settings, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Smartphone, Type, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, defaultPresentationSettings, type PresentationSlide, type PresentationSettings, type SlideBlock } from "@/lib/domain/presentation";
import KineticCanvas from "./kinetic-canvas";
import TimelineEditor from "./timeline-editor";
import { MediaUploader } from "@/components/media-uploader";

export default function GlobalPresenterClient({ setlists }: { setlists: any[] }) {
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>(setlists[0]?.id || "");
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"Property" | "Layers" | "Motion" | "Stage">("Property");
  const [isSaving, setIsSaving] = useState(false);
  const [playKey, setPlayKey] = useState<number>(0);
  
  const setlist = useMemo(() => setlists.find(s => s.id === selectedSetlistId) || setlists[0], [selectedSetlistId, setlists]);
  
  // Presentation Settings
  const [settings, setSettings] = useState<PresentationSettings>(setlist?.presentationSettings?.settings || defaultPresentationSettings);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(setlist?.presentationSettings?.linesPerSlide || 4);
  const [slideOverrides, setSlideOverrides] = useState<Record<string, SlideBlock[]>>(setlist?.presentationSettings?.slideOverrides || {});

  // --- History & Undo/Redo State ---
  type HistoryState = { settings: PresentationSettings; slideOverrides: Record<string, SlideBlock[]> };
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  
  // --- Stage Display Controls ---
  const [stageMessageInput, setStageMessageInput] = useState("");
  const [countdownInput, setCountdownInput] = useState(5);

  // --- Bible Controls ---
  const [bibleQuery, setBibleQuery] = useState("");
  const [bibleTranslation, setBibleTranslation] = useState("kjv");
  const [bibleVerses, setBibleVerses] = useState<{ reference: string, text: string }[]>([]);
  const [isFetchingBible, setIsFetchingBible] = useState(false);
  const [selectedBibleBook, setSelectedBibleBook] = useState("");

  const OLD_TESTAMENT_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
    "Zephaniah", "Haggai", "Zechariah", "Malachi",
  ];

  const NEW_TESTAMENT_BOOKS = [
    "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
    "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
    "Jude", "Revelation",
  ];

  const saveHistoryState = () => {
    setPast(prev => [...prev.slice(-49), { settings, slideOverrides }]);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [{ settings, slideOverrides }, ...prev]);
    setSettings(previous.settings);
    setSlideOverrides(previous.slideOverrides);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(prev => prev.slice(1));
    setPast(prev => [...prev, { settings, slideOverrides }]);
    setSettings(next.settings);
    setSlideOverrides(next.slideOverrides);
  };

  // Update local state when setlist changes
  useEffect(() => {
    if (setlist?.presentationSettings) {
      if (setlist.presentationSettings.settings) setSettings(setlist.presentationSettings.settings);
      if (setlist.presentationSettings.linesPerSlide) setLinesPerSlide(setlist.presentationSettings.linesPerSlide);
      if (setlist.presentationSettings.slideOverrides) setSlideOverrides(setlist.presentationSettings.slideOverrides);
    }
  }, [setlist]);
  
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
      event: "settings_sync",
      payload: { 
        settings, 
        linesPerSlide,
        slide: activeSlidePayload
      },
    });
    
    channel.send({
      type: "broadcast",
      event: "projector_sync",
      payload: { 
        settings,
        // Omit slide here so we don't accidentally push the editor's slide to the live projector
        // when the user is just tweaking styling properties.
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, linesPerSlide, channel, slideOverrides]); // Sync blocks and settings

  const handleSaveSettings = async () => {
    if (!setlist) return;
    setIsSaving(true);
    const payload = { settings, linesPerSlide, slideOverrides };
    const { error } = await supabase
      .from("setlists")
      .update({ presentation_settings: payload as any })
      .eq("id", setlist.id);
    setIsSaving(false);
    if (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings.");
    }
  };

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
    if (activeItemIndex === -2) {
      return bibleVerses.map(v => ({
         id: `bible-${v.reference.replace(/\s+/g, '-')}`,
         type: "lyrics",
         content: [v.text],
         sectionLabel: v.reference
      } as PresentationSlide));
    }
    if (!activeItem) return [];
    return generateSongSlides(activeItem.song.lyricsChords, linesPerSlide);
  }, [activeItem, linesPerSlide, activeItemIndex, bibleVerses]);

  const activeSlide = useMemo(() => slides.find(s => s.id === activeSlideId), [slides, activeSlideId]);
  
  const defaultBlocks = useMemo(() => {
     if (!activeSlide || activeSlide.content.length === 0) return [];
     const totalLines = activeSlide.content.length;
     
     // Auto-fit: same formula as projector — fill the canvas both horizontally and vertically
     const maxLineLength = Math.max(...activeSlide.content.map(line => line.length), 1);
     // Horizontal: safe max font size (pt) is approx 2200 / chars
     const hFit = 2200 / maxLineLength;
     // Vertical: canvas height = 100 units, lines take (fontSize * 1.3) each
     const vFit = 100 / (totalLines * 1.3);
     const autoFontSize = Math.min(hFit, settings.fontSize);
     const effectiveFontSize = Math.max(8, Math.round(autoFontSize));
     
     const gap = Math.max(15, effectiveFontSize * 0.25);
     const startY = 50 - ((totalLines - 1) * (gap / 2));
     return activeSlide.content.map((line, idx) => ({
        id: `default-${activeSlide.id}-${idx}`,
        text: line,
        x: 50,
        y: startY + (idx * gap),
        startTime: idx * 0.5,
        duration: 2
     } as SlideBlock));
  }, [activeSlide, settings.fontSize]);

  const activeBlocks = activeSlideId ? slideOverrides[activeSlideId] || defaultBlocks : [];
  const selectedBlock = useMemo(() => {
    if (selectedBlockIds.length === 0 || !activeBlocks) return null;
    return activeBlocks.find(b => selectedBlockIds.includes(b.id)) || null;
  }, [selectedBlockIds, activeBlocks]);

  const handleUpdateSelectedBlock = (updates: Partial<SlideBlock>) => {
    if (selectedBlockIds.length === 0 || !activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => selectedBlockIds.includes(b.id) ? { ...b, ...updates } : b)
      };
    });
  };
  const handleUpdateBlock = (blockId: string, updates: Partial<SlideBlock>) => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
      };
    });
  };
  const handleUpdateBlocks = (updatesMap: Record<string, Partial<SlideBlock>>) => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || defaultBlocks;
      return {
        ...prev,
        [activeSlideId]: currentBlocks.map(b => updatesMap[b.id] ? { ...b, ...updatesMap[b.id] } : b)
      };
    });
  };

  const handleChopToWords = () => {
    if (!activeSlide) return;
    
    // If we already have blocks, skip
    if (activeBlocks.length > 0) return;
    
    // Split lyrics into words
    const newBlocks: SlideBlock[] = [];
    let wordCounter = 0;
    
    const totalLines = activeSlide.content.length;
    
    // Calculate effective font size to correctly space lines vertically without breaking bounds
    const maxLineLength = Math.max(...activeSlide.content.map(line => line.length), 1);
    const maxAllowedFontSize = 2800 / maxLineLength;
    const effectiveFontSize = Math.min(settings.fontSize, maxAllowedFontSize);
    
    const gap = Math.max(15, effectiveFontSize * 0.25);
    const startY = 50 - ((totalLines - 1) * (gap / 2));
    
    activeSlide.content.forEach((line, lineIdx) => {
      const words = line.split(/\s+/).filter(Boolean);
      const numWords = words.length;
      
      // Center horizontally, assuming ~12% width per word
      const startX = 50 - ((numWords - 1) * 6);
      
      words.forEach((word, wordIdxInLine) => {
        const x = startX + (wordIdxInLine * 12);
        const y = startY + (lineIdx * gap);
        const startTime = wordCounter * 0.5; // Sequential start times, 0.5s apart
        
        newBlocks.push({
          id: `block-${wordCounter}-${Date.now()}`,
          text: word,
          x,
          y,
          startTime,
          duration: 2 // 2s duration default
        });
        
        wordCounter++;
      });
    });
    
    saveHistoryState();
    setSlideOverrides(prev => ({
      ...prev,
      [activeSlide.id]: newBlocks
    }));
  };

  const handleResetBlocks = () => {
    if (!activeSlideId) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const next = { ...prev };
      delete next[activeSlideId];
      return next;
    });
  };

  const handleDuplicateBlock = () => {
    if (!activeSlideId || selectedBlockIds.length === 0) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || [];
      const newBlocks: SlideBlock[] = [];
      
      currentBlocks.forEach(b => {
        if (selectedBlockIds.includes(b.id)) {
          newBlocks.push({
            ...b,
            id: `block-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            startTime: b.startTime + 0.5,
            x: b.x + 2,
            y: b.y + 2
          });
        }
      });
      
      return {
        ...prev,
        [activeSlideId]: [...currentBlocks, ...newBlocks]
      };
    });
  };

  const handleDeleteBlock = () => {
    if (!activeSlideId || selectedBlockIds.length === 0) return;
    saveHistoryState();
    setSlideOverrides(prev => {
      const currentBlocks = prev[activeSlideId] || [];
      return {
        ...prev,
        [activeSlideId]: currentBlocks.filter(b => !selectedBlockIds.includes(b.id))
      };
    });
    setSelectedBlockIds([]);
  };

  const handleUpdateDuration = (duration: number) => {
    if (!activeSlideId) return;
    saveHistoryState();
    const clampedDuration = Math.min(300, Math.max(1, duration));
    setSettings(prev => ({
      ...prev,
      slideDurations: {
        ...(prev.slideDurations || {}),
        [activeSlideId]: clampedDuration
      }
    }));
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setPlayKey(Date.now());
      } else if (e.code === "Backspace" || e.code === "Delete") {
        e.preventDefault();
        handleDeleteBlock();
      } else if (e.ctrlKey && e.code === "KeyD") {
        e.preventDefault();
        handleDuplicateBlock();
      } else if (e.ctrlKey && e.code === "KeyZ") {
        if (e.shiftKey) redo();
        else undo();
      } else if (e.ctrlKey && e.code === "KeyY") {
        redo();
      } else if (e.code.startsWith("Arrow") && selectedBlockIds.length > 0 && activeSlideId) {
        e.preventDefault();
        saveHistoryState();
        setSlideOverrides(prev => {
          const currentBlocks = prev[activeSlideId] || [];
          return {
            ...prev,
            [activeSlideId]: currentBlocks.map(b => {
              if (selectedBlockIds.includes(b.id)) {
                let dx = 0;
                let dy = 0;
                if (e.code === "ArrowUp") dy = -0.5;
                if (e.code === "ArrowDown") dy = 0.5;
                if (e.code === "ArrowLeft") dx = -0.5;
                if (e.code === "ArrowRight") dx = 0.5;
                return { ...b, x: b.x + dx, y: b.y + dy };
              }
              return b;
            })
          };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBlockIds, activeSlideId, slideOverrides, past, future]);

  const handleFetchBible = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bibleQuery.trim()) return;
    setIsFetchingBible(true);
    try {
      const params = new URLSearchParams({ q: bibleQuery, translation: bibleTranslation });
      const res = await fetch(`/api/bible?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Verse not found");
      if (data.verses && data.verses.length > 0) {
         const newVerses = data.verses.map((v: any) => ({
           reference: `${v.book_name} ${v.chapter}:${v.verse}`,
           text: v.text.trim()
         }));
         setBibleVerses(newVerses);
         setActiveItemIndex(-2);
      } else {
        alert("Verse not found. Try a format like \"John 3:16\" or \"Psalms 23:1-6\".");
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Verse not found. Try a format like \"John 3:16\".");
    } finally {
      setIsFetchingBible(false);
    }
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
                  setActiveSlideId(null);
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
           <button onClick={() => setActiveItemIndex(-1)} className={`p-2 rounded-lg ${activeItemIndex === -1 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><LayoutTemplate className="size-5" /></button>
           <button onClick={() => setActiveItemIndex(0)} className={`p-2 rounded-lg ${activeItemIndex >= 0 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><Music className="size-5" /></button>
           <button onClick={() => setActiveItemIndex(-2)} className={`p-2 rounded-lg ${activeItemIndex === -2 ? 'bg-violet-600/20 text-violet-400' : 'hover:bg-white/5 text-zinc-500 hover:text-zinc-300'}`}><BookOpen className="size-5" /></button>
           <button className="p-2 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300"><Settings className="size-5" /></button>
        </div>

        {/* Keynotes Sidebar: Line up */}
        <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col shrink-0">
          <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0">
             <button className="text-xs font-bold pb-2 border-b-2 text-white border-white">Line up</button>
             <button className="text-xs font-bold pb-2 border-b-2 text-zinc-600 border-transparent hover:text-zinc-400">Notes</button>
          </div>
          
          <div className="p-2 border-b border-white/5 bg-[#0a0a0a]">
             <button className="flex items-center gap-2 py-1.5 px-3 bg-[#18181b] border border-white/10 rounded text-xs font-bold text-zinc-300"><Music className="size-3"/> Song</button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {setlist.songs.map((item: any, idx: number) => (
              <button
                key={item.id}
                onClick={() => { setActiveItemIndex(idx); setActiveSlideId(null); }}
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
              {activeItemIndex === -2 ? (
                <div className="p-4 border-b border-white/5 bg-[#18181b]">
                   <form onSubmit={handleFetchBible} className="space-y-3">
                     <div>
                       <label className="text-[10px] font-bold text-zinc-500 uppercase">Search Verse</label>
                       <input 
                         type="text" 
                         value={bibleQuery} 
                         onChange={e => setBibleQuery(e.target.value)} 
                         placeholder="e.g. John 3:16" 
                         className="w-full mt-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500" 
                       />
                     </div>
                     <div>
                       <label className="text-[10px] font-bold text-zinc-500 uppercase">Browse by Book</label>
                       <select
                         value={selectedBibleBook}
                         onChange={e => {
                           const book = e.target.value;
                           setSelectedBibleBook(book);
                           if (book) setBibleQuery(book + " 1:1");
                         }}
                         className="w-full mt-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                       >
                         <option value="">— Select a Book —</option>
                         <optgroup label="── Old Testament ──">
                           {OLD_TESTAMENT_BOOKS.map(book => (
                             <option key={book} value={book}>{book}</option>
                           ))}
                         </optgroup>
                         <optgroup label="── New Testament ──">
                           {NEW_TESTAMENT_BOOKS.map(book => (
                             <option key={book} value={book}>{book}</option>
                           ))}
                         </optgroup>
                       </select>
                     </div>
                     <div className="flex gap-2">
                       <select 
                         value={bibleTranslation} 
                         onChange={e => setBibleTranslation(e.target.value)}
                         className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                       >
                         <option value="kjv">KJV</option>
                         <option value="web">WEB</option>
                         <option value="bbe">BBE</option>
                         <option value="ylt">YLT</option>
                         <option value="oeb-us">OEB</option>
                       </select>
                       <button type="submit" disabled={isFetchingBible} className="bg-violet-600 hover:bg-violet-500 text-white rounded px-3 py-1.5 text-xs font-bold transition disabled:opacity-50">
                         {isFetchingBible ? "..." : "Search"}
                       </button>
                     </div>
                   </form>
                </div>
              ) : (
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 shrink-0 bg-[#18181b]">
                   <div className="flex flex-col justify-center min-w-0">
                     <span className="text-xs font-bold text-white truncate">{activeItem?.song.title}</span>
                     <span className="text-[10px] font-semibold text-zinc-500">Lyrics Reflow</span>
                   </div>
                   <div className="flex bg-black/50 rounded p-0.5 border border-white/10 shrink-0">
                      {[1, 2, 4, 8].map(num => (
                        <button
                          key={num}
                          onClick={() => setLinesPerSlide(num)}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold transition",
                            linesPerSlide === num ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                   </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                 {slides.map((slide) => {
                    const isActive = activeSlideId === slide.id;
                    const label = slide.sectionLabel || "Lyrics";
                    const initial = label.charAt(0).toUpperCase();

                    let colorClass = "text-[#3b82f6]"; 
                    let bgClass = "bg-[#3b82f6]";
                    let borderClass = "border-[#10b981]"; 
                    
                    const lowerLabel = label.toLowerCase();
                    if (lowerLabel.includes("verse")) {
                      borderClass = "border-[#10b981]";
                      colorClass = "text-[#10b981]";
                      bgClass = "bg-[#10b981]";
                    } else if (lowerLabel.includes("chorus")) {
                      borderClass = "border-[#3b82f6]";
                      colorClass = "text-[#3b82f6]";
                      bgClass = "bg-[#3b82f6]";
                    } else if (lowerLabel.includes("intro") || lowerLabel.includes("instrumental") || lowerLabel.includes("intrumental")) {
                      borderClass = "border-[#8b5cf6]";
                      colorClass = "text-[#8b5cf6]";
                      bgClass = "bg-[#8b5cf6]";
                    } else if (lowerLabel.includes("bridge")) {
                      borderClass = "border-[#eab308]";
                      colorClass = "text-[#eab308]";
                      bgClass = "bg-[#eab308]";
                    }
                    
                    return (
                      <button 
                        key={slide.id}
                        onClick={() => { setActiveSlideId(slide.id); pushToProjector(slide); }}
                        className={cn(
                          "w-full flex flex-col rounded-lg overflow-hidden transition text-left border bg-[#18181b]",
                          isActive 
                            ? "ring-2 ring-white/30" 
                            : "hover:brightness-110",
                          borderClass
                        )}
                      >
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 w-full border-b border-white/5">
                          <div className={cn("size-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white", bgClass)}>
                            {initial}
                          </div>
                          <span className={cn("text-xs font-bold tracking-wide", colorClass)}>
                            {label}
                          </span>
                        </div>
                        
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
                  {activeSlideId && activeSlide ? (
                     <KineticCanvas 
                       blocks={activeBlocks} 
                       settings={settings} 
                       onUpdateBlock={handleUpdateBlock}
                       onUpdateBlocks={handleUpdateBlocks}
                       slide={activeSlide}
                       playKey={playKey}
                       selectedBlockIds={selectedBlockIds}
                       onSelectBlock={setSelectedBlockIds}
                     />
                  ) : (
                     <div className="text-zinc-600 font-bold">Select a slide to edit</div>
                  )}
                  
                  {/* Floating properties quick toggle (optional) */}
                  <div className="absolute top-4 left-4 flex gap-2">
                     <button 
                       onClick={() => pushToProjector(activeSlide || null)}
                       title="Push to Projector"
                       className="bg-black/50 border border-emerald-500/30 text-emerald-400 p-2 rounded hover:bg-emerald-500/20 transition"
                     >
                       <MonitorUp className="size-4" />
                     </button>
                  </div>
               </div>

               {/* Bottom Timeline */}
               <TimelineEditor 
                 blocks={activeBlocks} 
                 onUpdateBlock={handleUpdateBlock}
                 onUpdateBlocks={handleUpdateBlocks}
                 onChopToWords={handleChopToWords}
                 onReset={handleResetBlocks}
                 onPlay={() => setPlayKey(Date.now())}
                 playKey={playKey}
                 selectedBlockIds={selectedBlockIds}
                 onSelectBlock={setSelectedBlockIds}
                 onDuplicateBlock={handleDuplicateBlock}
                 onDeleteBlock={handleDeleteBlock}
                 totalDuration={activeSlideId ? (settings.slideDurations?.[activeSlideId] || 10) : 10}
                 onUpdateDuration={handleUpdateDuration}
                 onUndo={undo}
                 onRedo={redo}
                 canUndo={past.length > 0}
                 canRedo={future.length > 0}
               />
            </>
          )}
        </div>

        {/* Right Sidebar: Properties & Motion & Stage */}
        <div className="w-[300px] border-l border-white/10 bg-[#121212] flex flex-col shrink-0">
           {/* Tabs */}
           <div className="px-4 pt-4 border-b border-white/5 flex gap-4 shrink-0 overflow-x-auto">
             {["Property", "Layers", "Motion", "Stage"].map(tab => (
               <button 
                 key={tab}
                 onClick={() => setActiveTab(tab as any)}
                 className={cn(
                   "text-xs font-bold pb-2 border-b-2 transition-colors whitespace-nowrap",
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
                       <button onClick={handleSaveSettings} disabled={isSaving} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white flex items-center gap-1 transition">
                         {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                         Save for Setlist
                       </button>
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
                     <p className="text-[10px] flex items-center justify-between font-bold text-zinc-500 uppercase tracking-wider">
                       Character {selectedBlock && <span className="text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Block Override</span>}
                     </p>
                     
                     <div className="space-y-2">
                       {selectedBlock && (
                         <input 
                           type="text" 
                           value={selectedBlock.text}
                           onChange={(e) => handleUpdateSelectedBlock({ text: e.target.value })}
                           className="w-full bg-zinc-900 border border-emerald-500/50 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 mb-2"
                           placeholder="Edit text..."
                         />
                       )}
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                         value={selectedBlock?.fontFamily || settings.fontFamily}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ fontFamily: e.target.value });
                           else setSettings({...settings, fontFamily: e.target.value});
                         }}
                       >
                         <option value="Arial">Arial</option>
                         <option value="Arial Black">Arial Black</option>
                         <option value="Inter">Inter (Sans)</option>
                         <option value="Roboto">Roboto</option>
                         <option value="Open Sans">Open Sans</option>
                         <option value="Montserrat">Montserrat</option>
                         <option value="Lato">Lato</option>
                         <option value="Poppins">Poppins</option>
                         <option value="Playfair Display">Playfair Display</option>
                         <option value="Oswald">Oswald</option>
                         <option value="Raleway">Raleway</option>
                         <option value="Nunito">Nunito</option>
                         <option value="Ubuntu">Ubuntu</option>
                         <option value="Merriweather">Merriweather</option>
                         <option value="PT Serif">PT Serif</option>
                         <option value="Lora">Lora</option>
                         <option value="Times New Roman">Times New Roman</option>
                         <option value="Courier New">Courier New</option>
                         <option value="Georgia">Georgia</option>
                       </select>
                       
                       <div className="flex gap-2">
                         <div className="flex-1 flex items-center bg-[#1a1a1a] border border-white/10 rounded px-2">
                            <input 
                              type="number" 
                              value={selectedBlock?.fontSize || settings.fontSize} 
                              onChange={(e) => {
                                if (selectedBlock) handleUpdateSelectedBlock({ fontSize: Number(e.target.value) });
                                else setSettings({...settings, fontSize: Number(e.target.value)});
                              }}
                              className="w-full bg-transparent text-white text-sm py-1.5 focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500 font-bold ml-2">pt</span>
                         </div>
                       </div>

                       <div className="flex rounded bg-[#1a1a1a] border border-white/10 overflow-hidden mt-2">
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ bold: !(selectedBlock.bold ?? settings.bold) });
                           else setSettings({...settings, bold: !settings.bold});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition border-r border-white/5", (selectedBlock?.bold ?? settings.bold) && "bg-white/10 text-white")}><Bold className="size-4" /></button>
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ italic: !(selectedBlock.italic ?? settings.italic) });
                           else setSettings({...settings, italic: !settings.italic});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center border-r border-white/5 hover:bg-white/5 transition", (selectedBlock?.italic ?? settings.italic) && "bg-white/10 text-white")}><Italic className="size-4" /></button>
                         <button onClick={() => {
                           if (selectedBlock) handleUpdateSelectedBlock({ underline: !(selectedBlock.underline ?? settings.underline) });
                           else setSettings({...settings, underline: !settings.underline});
                         }} className={cn("flex-1 py-1.5 flex items-center justify-center hover:bg-white/5 transition", (selectedBlock?.underline ?? settings.underline) && "bg-white/10 text-white")}><Underline className="size-4" /></button>
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
                     
                     <div className="pt-2">
                       <MediaUploader
                         currentUrl={settings.backgroundMediaUrl}
                         currentType={settings.backgroundMediaType}
                         onUpload={(url, type) => setSettings({ ...settings, backgroundMediaUrl: url, backgroundMediaType: type })}
                         onClear={() => setSettings({ ...settings, backgroundMediaUrl: undefined, backgroundMediaType: undefined })}
                       />
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
                     <p className="text-xs font-bold text-blue-500">{selectedBlock ? "Layer Override" : "Global Animation"}</p>
                     <button onClick={() => setSettings(defaultPresentationSettings)} className="text-[10px] font-bold text-zinc-400 hover:text-white transition">Reset to Global</button>
                  </div>

                  {/* SLIDE TRANSITION (Global Only) */}
                  {!selectedBlock && (
                     <div className="space-y-3 pb-4 border-b border-white/5">
                         <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Slide Transition</p>
                         <select 
                           className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                           value={settings.slideTransition || "None"}
                           onChange={(e) => setSettings({...settings, slideTransition: e.target.value as any})}
                         >
                           <option value="None">None (Cut)</option>
                           <option value="Crossfade">Crossfade</option>
                           <option value="Slide Up">Slide Up</option>
                           <option value="Slide Down">Slide Down</option>
                           <option value="Slide Left">Slide Left</option>
                           <option value="Slide Right">Slide Right</option>
                           <option value="Zoom In">Zoom In</option>
                           <option value="Zoom Out">Zoom Out</option>
                           <option value="Blur">Blur</option>
                           <option value="Flip">Flip</option>
                         </select>
                      </div>
                  )}

                  {/* ENTRANCE ANIMATION */}
                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Entrance Animation</p>
                     
                     <div className="space-y-1">
                        <p className="text-xs text-zinc-400 font-semibold">Effect</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.entranceAnimation ?? settings.entranceAnimation}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ entranceAnimation: e.target.value });
                            else setSettings({...settings, entranceAnimation: e.target.value as any});
                          }}
                        >
                          <option value="None">None</option>
                          <optgroup label="── Fade">
                            <option value="Appear">Appear (Flash)</option>
                            <option value="Fade In">Fade In</option>
                            <option value="Blur In">Blur In</option>
                          </optgroup>
                          <optgroup label="── Slide">
                            <option value="Slide In Up">Slide In Up</option>
                            <option value="Slide In Down">Slide In Down</option>
                            <option value="Slide In Left">Slide In Left</option>
                            <option value="Slide In Right">Slide In Right</option>
                            <option value="Rise Up">Rise Up (Big)</option>
                            <option value="Drop Down">Drop Down (Big)</option>
                            <option value="Mask In Up">Mask In Up</option>
                          </optgroup>
                          <optgroup label="── Zoom">
                            <option value="Zoom In">Zoom In</option>
                            <option value="Zoom In Bounce">Zoom In Bounce</option>
                            <option value="Bounce In">Bounce In</option>
                          </optgroup>
                          <optgroup label="── Flip / Rotate">
                            <option value="Flip In X">Flip In X (Horizontal)</option>
                            <option value="Flip In Y">Flip In Y (Vertical)</option>
                            <option value="Rotate In">Rotate In</option>
                            <option value="Roll In">Roll In</option>
                            <option value="Swing In">Swing In</option>
                          </optgroup>
                          <optgroup label="── Skew">
                            <option value="Skew In Left">Skew In Left</option>
                            <option value="Skew In Right">Skew In Right</option>
                          </optgroup>
                        </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Duration: {selectedBlock?.entranceDuration ?? settings.entranceDuration}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.entranceDuration ?? settings.entranceDuration}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ entranceDuration: Number(e.target.value) });
                           else setSettings({...settings, entranceDuration: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Delay: {selectedBlock?.entranceDelay ?? settings.entranceDelay}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.entranceDelay ?? settings.entranceDelay}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ entranceDelay: Number(e.target.value) });
                           else setSettings({...settings, entranceDelay: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Easing Curve</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.entranceCurve ?? settings.entranceCurve}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ entranceCurve: e.target.value });
                            else setSettings({...settings, entranceCurve: e.target.value});
                          }}
                        >
                          <option value="Ease Out">Ease Out</option>
                          <option value="Ease In">Ease In</option>
                          <option value="Ease In Out">Ease In Out</option>
                          <option value="Linear">Linear</option>
                          <option value="Spring">Spring (Bounce)</option>
                          <option value="Sharp">Sharp</option>
                        </select>
                        <div className="h-8 mt-2 w-full border-b border-l border-white/10 relative overflow-hidden">
                          <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                            {(() => {
                              const c = selectedBlock?.entranceCurve ?? settings.entranceCurve;
                              if (c === "Ease Out")    return <path d="M0,100 C10,100 30,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Ease In")     return <path d="M0,100 C70,100 90,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Ease In Out") return <path d="M0,100 C30,100 70,0 100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Spring")      return <path d="M0,100 C20,0 40,120 60,90 S80,-10 100,0" fill="none" stroke="#a78bfa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              if (c === "Sharp")       return <path d="M0,100 C0,100 0,0 100,0" fill="none" stroke="#f472b6" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                              return <path d="M0,100 L100,0" fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>;
                            })()}
                          </svg>
                        </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* EXIT ANIMATION */}
                  <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Exit Animation</p>
                     
                     <div className="space-y-1">
                        <p className="text-xs text-zinc-400 font-semibold">Effect</p>
                        <select 
                          className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                          value={selectedBlock?.exitAnimation ?? settings.exitAnimation}
                          onChange={(e) => {
                            if (selectedBlock) handleUpdateSelectedBlock({ exitAnimation: e.target.value });
                            else setSettings({...settings, exitAnimation: e.target.value as any});
                          }}
                        >
                          <option value="None">None</option>
                          <optgroup label="── Fade">
                            <option value="Disappear">Disappear (Flash)</option>
                            <option value="Fade Out">Fade Out</option>
                            <option value="Blur Out">Blur Out</option>
                          </optgroup>
                          <optgroup label="── Slide">
                            <option value="Slide Out Up">Slide Out Up</option>
                            <option value="Slide Out Down">Slide Out Down</option>
                            <option value="Slide Out Left">Slide Out Left</option>
                            <option value="Slide Out Right">Slide Out Right</option>
                            <option value="Shrink Up">Shrink Up</option>
                            <option value="Mask Out Up">Mask Out Up</option>
                          </optgroup>
                          <optgroup label="── Zoom">
                            <option value="Zoom Out">Zoom Out</option>
                            <option value="Zoom Out Blow">Zoom Out Blow</option>
                            <option value="Bounce Out">Bounce Out</option>
                          </optgroup>
                          <optgroup label="── Flip / Rotate">
                            <option value="Flip Out X">Flip Out X (Horizontal)</option>
                            <option value="Flip Out Y">Flip Out Y (Vertical)</option>
                            <option value="Rotate Out">Rotate Out</option>
                          </optgroup>
                          <optgroup label="── Skew">
                            <option value="Skew Out Left">Skew Out Left</option>
                            <option value="Skew Out Right">Skew Out Right</option>
                          </optgroup>
                        </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Duration: {selectedBlock?.exitDuration ?? settings.exitDuration}s</p>
                       <input 
                         type="range" min="0" max="5" step="0.1"
                         value={selectedBlock?.exitDuration ?? settings.exitDuration}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitDuration: Number(e.target.value) });
                           else setSettings({...settings, exitDuration: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Delay: {selectedBlock?.exitDelay ?? settings.exitDelay}s</p>
                       <input 
                         type="range" min="0" max="10" step="0.1"
                         value={selectedBlock?.exitDelay ?? settings.exitDelay}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitDelay: Number(e.target.value) });
                           else setSettings({...settings, exitDelay: Number(e.target.value)});
                         }}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Easing Curve</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={selectedBlock?.exitCurve ?? settings.exitCurve}
                         onChange={(e) => {
                           if (selectedBlock) handleUpdateSelectedBlock({ exitCurve: e.target.value });
                           else setSettings({...settings, exitCurve: e.target.value});
                         }}
                       >
                         <option value="Ease Out">Ease Out</option>
                         <option value="Ease In">Ease In</option>
                         <option value="Ease In Out">Ease In Out</option>
                         <option value="Linear">Linear</option>
                       </select>
                       <div className="h-8 mt-2 w-full border-b border-l border-white/10 relative overflow-hidden">
                         <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                           <path d={(selectedBlock?.exitCurve ?? settings.exitCurve) === "Ease Out" ? "M0,100 Q20,10 100,0" : "M0,100 L100,0"} fill="none" stroke="#60a5fa" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
                         </svg>
                       </div>
                     </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* KINETIC TEXT */}
                  <div className="space-y-3 pb-8">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Kinetic Text</p>
                     
                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Kinetic Mode</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticMode}
                         onChange={(e) => setSettings({...settings, kineticMode: e.target.value})}
                       >
                         <option value="Word by Word">Word by Word</option>
                         <option value="Line by Line">Line by Line</option>
                         <option value="Character">Character</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Animation Order</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticAnimationOrder}
                         onChange={(e) => setSettings({...settings, kineticAnimationOrder: e.target.value})}
                       >
                         <option value="Forward">Forward</option>
                         <option value="Backward">Backward</option>
                         <option value="Random">Random</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Stagger Delay: {settings.kineticStaggerDelay}s</p>
                       <input 
                         type="range" min="0" max="1" step="0.05"
                         value={settings.kineticStaggerDelay}
                         onChange={(e) => setSettings({...settings, kineticStaggerDelay: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Smoothing Curve</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticSmoothingCurve}
                         onChange={(e) => setSettings({...settings, kineticSmoothingCurve: e.target.value})}
                       >
                         <option value="Smooth">Smooth</option>
                         <option value="Linear">Linear</option>
                         <option value="Spring">Spring</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Direction</p>
                       <select 
                         className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-violet-500"
                         value={settings.kineticDirection}
                         onChange={(e) => setSettings({...settings, kineticDirection: e.target.value})}
                       >
                         <option value="Fly Up">Fly Up</option>
                         <option value="Fly Down">Fly Down</option>
                         <option value="Fly Left">Fly Left</option>
                         <option value="Fly Right">Fly Right</option>
                       </select>
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Travel Distance: {settings.kineticTravelDistance} px</p>
                       <input 
                         type="range" min="0" max="200" step="1"
                         value={settings.kineticTravelDistance}
                         onChange={(e) => setSettings({...settings, kineticTravelDistance: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                     <div className="space-y-1">
                       <p className="text-xs text-zinc-400 font-semibold">Segment Duration: {settings.kineticSegmentDuration}s</p>
                       <input 
                         type="range" min="0" max="2" step="0.05"
                         value={settings.kineticSegmentDuration}
                         onChange={(e) => setSettings({...settings, kineticSegmentDuration: Number(e.target.value)})}
                         className="w-full accent-white"
                       />
                     </div>

                  </div>
                </div>
              )}

              {activeTab === "Stage" && (
                <div className="p-4 space-y-6">
                  <div className="space-y-3 pb-4 border-b border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Flash Note</p>
                    <input 
                      type="text" 
                      placeholder="Message for band..."
                      value={stageMessageInput}
                      onChange={(e) => setStageMessageInput(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                    <div className="flex gap-2 mt-2">
                       <button 
                         onClick={() => {
                           channel.send({ type: "broadcast", event: "stage_sync", payload: { stageMessage: stageMessageInput } });
                         }}
                         className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold py-2 rounded transition"
                       >
                         Send
                       </button>
                       <button 
                         onClick={() => {
                           setStageMessageInput("");
                           channel.send({ type: "broadcast", event: "stage_sync", payload: { stageMessage: "" } });
                         }}
                         className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold py-2 rounded transition border border-red-900/50"
                       >
                         Clear
                       </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Countdown Timer</p>
                    <div className="flex gap-2 items-center">
                       <input 
                         type="number" 
                         min="1"
                         value={countdownInput}
                         onChange={(e) => setCountdownInput(Number(e.target.value))}
                         className="w-20 bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 text-center"
                       />
                       <span className="text-sm text-zinc-400 font-bold">Minutes</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                       <button 
                         onClick={() => {
                           channel.send({ type: "broadcast", event: "stage_sync", payload: { countdownTarget: Date.now() + countdownInput * 60000 } });
                         }}
                         className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded transition"
                       >
                         Start
                       </button>
                       <button 
                         onClick={() => {
                           channel.send({ type: "broadcast", event: "stage_sync", payload: { countdownTarget: null } });
                         }}
                         className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs font-bold py-2 rounded transition border border-red-900/50"
                       >
                         Stop
                       </button>
                    </div>
                  </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
