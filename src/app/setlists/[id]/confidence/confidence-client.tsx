"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, type PresentationSlide, type PresentationSettings } from "@/lib/domain/presentation";
import { stageLayoutPreset, type StageLayout } from "@/lib/desktop/stage-layout";

export default function ConfidenceClient({ setlist, initialLiveState = {} }: { setlist: any; initialLiveState?: Record<string, any> }) {
  const [activeSlideId, setActiveSlideId] = useState<string | null>(initialLiveState.activeSlideId || null);
  const [liveSlide, setLiveSlide] = useState<PresentationSlide | null>(initialLiveState.slide || null);
  const [liveNextSlide, setLiveNextSlide] = useState<PresentationSlide | null>(initialLiveState.nextSlide || null);
  const [liveNotes, setLiveNotes] = useState<string>(initialLiveState.speakerNotes || "");
  const [settings, setSettings] = useState<PresentationSettings | null>(null);
  const [linesPerSlide, setLinesPerSlide] = useState<number>(4);
  const [isConnected, setIsConnected] = useState(false);
  const [stageLayout, setStageLayout] = useState<StageLayout>(() => ({ ...stageLayoutPreset("full"), ...(initialLiveState.stageLayout || {}) }));
  const showChords = stageLayout.showChords;
  const [stageMessage, setStageMessage] = useState("");
  const [stageFlashStyle, setStageFlashStyle] = useState({ fontSize: 56, color: "#ffffff", backgroundColor: "#dc2626" });
  const [countdownTarget, setCountdownTarget] = useState<number | null>(initialLiveState.countdownTarget || null);
  const [pausedCountdownMs, setPausedCountdownMs] = useState<number | null>(initialLiveState.countdownPausedMs || null);
  const [now, setNow] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (window.anointedDesktop) void window.anointedDesktop.markOutputReady("confidence");
  }, []);

  useEffect(() => {
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTick);
      clearInterval(t);
    };
  }, []);

  // Generate all slides from setlist
  const allSlides = useMemo(() => {
    let slides: PresentationSlide[] = [];
    if (!setlist?.songs) return slides;
    setlist.songs.forEach((item: any) => {
      const songSlides = generateSongSlides(item.song.lyricsChords, linesPerSlide).map((slide) => ({ ...slide, speakerNotes: item.notes || "" }));
      slides = slides.concat(songSlides);
    });
    return slides;
  }, [setlist, linesPerSlide]);

  useEffect(() => {
    if (window.anointedDesktop) {
      const channel = new BroadcastChannel(`setlist_${setlist.id}`);
      const receive = (message: MessageEvent<{ event?: string; payload?: any }>) => {
        const payload = message.data?.payload;
        if (!payload) return;
        if (message.data.event === "settings_sync") {
          if (payload.linesPerSlide) setLinesPerSlide(payload.linesPerSlide);
          if (payload.settings) setSettings(payload.settings);
        }
        if (message.data.event === "projector_sync") {
          if (payload.slide !== undefined) {
            setActiveSlideId(payload.slide?.id || payload.activeSlideId || null);
            setLiveSlide(payload.slide || null);
            setLiveNextSlide(payload.nextSlide || null);
            setLiveNotes(payload.speakerNotes || "");
          }
          if (payload.settings) setSettings(payload.settings);
        }
        if (message.data.event === "stage_sync") {
          if (payload.stageMessage !== undefined) setStageMessage(payload.stageMessage);
          if (payload.stageFlashStyle) setStageFlashStyle(payload.stageFlashStyle);
          if (payload.countdownTarget !== undefined) setCountdownTarget(payload.countdownTarget);
          if (payload.countdownPausedMs !== undefined) setPausedCountdownMs(payload.countdownPausedMs);
          if (payload.stageLayout) setStageLayout({ ...stageLayoutPreset("full"), ...payload.stageLayout });
        }
      };
      channel.addEventListener("message", receive);
      channel.postMessage({ event: "presentation_state_request", payload: { output: "confidence" } });
      setIsConnected(true);
      return () => { channel.removeEventListener("message", receive); channel.close(); };
    }
    const channel = supabase.channel(`setlist_${setlist.id}`);

    channel
      .on("broadcast", { event: "settings_sync" }, (payload: any) => {
        if (payload.payload?.linesPerSlide) {
          setLinesPerSlide(payload.payload.linesPerSlide);
        }
        if (payload.payload?.settings) {
          setSettings(payload.payload.settings);
        }
      })
      .on("broadcast", { event: "projector_sync" }, (payload: any) => {
        if (payload.payload) {
          if (payload.payload.slide !== undefined) {
            setActiveSlideId(payload.payload.slide?.id || null);
            setLiveSlide(payload.payload.slide || null);
            setLiveNextSlide(payload.payload.nextSlide || null);
            setLiveNotes(payload.payload.speakerNotes || "");
          }
        }
      })
      .on("broadcast", { event: "stage_sync" }, (payload: any) => {
        if (payload.payload) {
          if (payload.payload.stageMessage !== undefined) {
            setStageMessage(payload.payload.stageMessage);
          }
          if (payload.payload.stageFlashStyle) setStageFlashStyle(payload.payload.stageFlashStyle);
          if (payload.payload.countdownTarget !== undefined) {
            setCountdownTarget(payload.payload.countdownTarget);
          }
          if (payload.payload.countdownPausedMs !== undefined) {
            setPausedCountdownMs(payload.payload.countdownPausedMs);
          }
          if (payload.payload.stageLayout) setStageLayout({ ...stageLayoutPreset("full"), ...payload.payload.stageLayout });
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setlist.id, supabase]);

  const currentIndex = allSlides.findIndex(s => s.id === activeSlideId);
  const currentSlide = liveSlide || (currentIndex >= 0 ? allSlides[currentIndex] : null);
  const nextSlide = liveNextSlide || (currentIndex >= 0 && currentIndex < allSlides.length - 1 ? allSlides[currentIndex + 1] : null);

  const timeString = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let countdownString = "";
  let isOvertime = false;
  if (countdownTarget || pausedCountdownMs !== null) {
     const diff = pausedCountdownMs ?? (countdownTarget! - now);
     isOvertime = diff < 0;
     const absDiff = Math.abs(diff);
     const m = Math.floor(absDiff / 60000);
     const s = Math.floor((absDiff % 60000) / 1000);
     countdownString = `${isOvertime ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="fixed inset-0 bg-black text-white p-8 sm:p-12 overflow-hidden flex flex-col font-sans">
      {!isConnected && (
        <div className="absolute top-4 right-4 bg-red-600 px-3 py-1 rounded text-xs font-bold uppercase z-50">
          Offline
        </div>
      )}

      {/* Stage Message Banner */}
      {stageMessage && (
         <div style={{ backgroundColor: stageFlashStyle.backgroundColor, color: stageFlashStyle.color, fontSize: `${stageFlashStyle.fontSize}px` }} className="absolute top-0 left-0 right-0 font-bold text-center py-4 animate-pulse z-50 shadow-2xl border-b-8 border-black/30">
            {stageMessage}
         </div>
      )}

      {/* Header (Controls & Timers) */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-40">
         {/* Controls */}
         <button 
           onClick={() => setStageLayout((layout) => ({ ...layout, showChords: !layout.showChords }))}
           className={cn("px-4 py-2 rounded text-sm font-bold border transition", showChords ? "bg-yellow-500 text-black border-yellow-500" : "bg-black/50 text-zinc-400 border-white/20 hover:text-white")}
         >
           {showChords ? "Hide Chords" : "Show Chords"}
         </button>

         {/* Timers */}
         <div className="flex flex-col items-end gap-2">
            {stageLayout.showClock && <div className="text-4xl sm:text-5xl font-mono font-bold text-zinc-400">
               {timeString}
            </div>}
            {stageLayout.showCountdown && (countdownTarget || pausedCountdownMs !== null) && (
               <div className={cn("text-5xl sm:text-7xl font-mono font-black", isOvertime ? "text-red-500 animate-pulse" : "text-green-500")}>
                  {countdownString}
               </div>
            )}
         </div>
      </div>

      {/* Current Slide (Main Focus) */}
      {stageLayout.showCurrent && <div className="flex-1 flex flex-col justify-center items-center text-center mt-12">
        {currentSlide ? (
          <div className="w-full">
            {(showChords && currentSlide.chordLines ? currentSlide.chordLines : currentSlide.content.map(l => ({ lyric: l, chords: undefined }))).map((line, idx) => (
              <div key={idx} className="mb-6 sm:mb-12 inline-block text-left w-auto max-w-full">
                {showChords && line.chords && (
                  <p className="text-yellow-400 font-bold text-3xl sm:text-5xl font-mono whitespace-pre mb-2">
                     {line.chords}
                  </p>
                )}
                <p className={cn("text-5xl sm:text-7xl font-bold leading-tight whitespace-pre-wrap", showChords && "font-mono tracking-tighter")}>
                  {line.lyric || " "}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-4xl text-zinc-500 font-bold">Waiting for slide...</p>
        )}
      </div>}

      {/* Divider */}
      {stageLayout.showNext && <div className="w-full h-px bg-white/20 my-8" />}

      {/* Next Slide (Secondary Focus) */}
      {stageLayout.showNext && <div className="h-1/3 flex flex-col justify-start items-center text-center opacity-60">
        {nextSlide ? (
          <div className="w-full">
            <p className="text-xl sm:text-2xl text-zinc-400 font-bold uppercase tracking-widest mb-4">Next</p>
            {nextSlide.content.map((line, idx) => (
              <p key={idx} className="text-3xl sm:text-4xl font-semibold leading-tight mb-2 text-zinc-300">
                {line}
              </p>
            ))}
          </div>
        ) : currentSlide ? (
          <p className="text-2xl text-zinc-600 font-bold uppercase tracking-widest mt-8">End of Presentation</p>
        ) : null}
      </div>}
      {stageLayout.showNotes && (liveNotes || (currentSlide as any)?.speakerNotes) && <div className="absolute bottom-4 left-4 right-4 rounded bg-white/5 px-4 py-2 text-center text-lg font-semibold text-amber-200">{liveNotes || (currentSlide as any).speakerNotes}</div>}
    </div>
  );
}
