"use client";

import { useEffect, useState, useMemo } from "react";
import { createOptionalClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateSongSlides, type PresentationSlide } from "@/lib/domain/presentation";
import { stageLayoutPreset, type StageLayout } from "@/lib/desktop/stage-layout";

type ConfidenceSlide = PresentationSlide & { speakerNotes?: string };
type StageFlashStyle = { fontSize: number; color: string; backgroundColor: string };

export type ConfidenceSetlist = {
  id: string;
  songs: Array<{
    id: string;
    notes: string;
    song: { id: string; title: string; lyricsChords: string };
  }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function confidenceSlide(value: unknown): ConfidenceSlide | null {
  const slide = record(value);
  if (
    !slide
    || typeof slide.id !== "string"
    || !["lyrics", "teaching", "blank"].includes(String(slide.type))
    || !Array.isArray(slide.content)
    || !slide.content.every((line) => typeof line === "string")
  ) return null;
  return value as ConfidenceSlide;
}

function mergedStageLayout(value: unknown): StageLayout {
  const fallback = stageLayoutPreset("full");
  const layout = record(value);
  if (!layout) return fallback;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, defaultValue]) => [
      key,
      typeof layout[key] === "boolean" ? layout[key] : defaultValue,
    ]),
  ) as StageLayout;
}

function stageFlash(value: unknown): StageFlashStyle | null {
  const flash = record(value);
  return flash
    && typeof flash.fontSize === "number"
    && typeof flash.color === "string"
    && typeof flash.backgroundColor === "string"
    ? {
        fontSize: flash.fontSize,
        color: flash.color,
        backgroundColor: flash.backgroundColor,
      }
    : null;
}

export default function ConfidenceClient({
  setlist,
  initialLiveState = {},
}: {
  setlist: ConfidenceSetlist;
  initialLiveState?: Record<string, unknown>;
}) {
  const [activeSlideId, setActiveSlideId] = useState<string | null>(
    typeof initialLiveState.activeSlideId === "string" ? initialLiveState.activeSlideId : null,
  );
  const [liveSlide, setLiveSlide] = useState<ConfidenceSlide | null>(() => confidenceSlide(initialLiveState.slide));
  const [liveNextSlide, setLiveNextSlide] = useState<ConfidenceSlide | null>(() => confidenceSlide(initialLiveState.nextSlide));
  const [liveNotes, setLiveNotes] = useState<string>(
    typeof initialLiveState.speakerNotes === "string" ? initialLiveState.speakerNotes : "",
  );
  const [linesPerSlide, setLinesPerSlide] = useState<number>(4);
  const [isConnected, setIsConnected] = useState(false);
  const [stageLayout, setStageLayout] = useState<StageLayout>(() => mergedStageLayout(initialLiveState.stageLayout));
  const showChords = stageLayout.showChords;
  const [stageMessage, setStageMessage] = useState("");
  const [stageFlashStyle, setStageFlashStyle] = useState({ fontSize: 56, color: "#ffffff", backgroundColor: "#dc2626" });
  const [countdownTarget, setCountdownTarget] = useState<number | null>(
    typeof initialLiveState.countdownTarget === "number" ? initialLiveState.countdownTarget : null,
  );
  const [pausedCountdownMs, setPausedCountdownMs] = useState<number | null>(
    typeof initialLiveState.countdownPausedMs === "number" ? initialLiveState.countdownPausedMs : null,
  );
  const [now, setNow] = useState(0);
  const supabase = useMemo(() => createOptionalClient(), []);

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
    let slides: ConfidenceSlide[] = [];
    if (!setlist?.songs) return slides;
    setlist.songs.forEach((item) => {
      const songSlides = generateSongSlides(item.song.lyricsChords, linesPerSlide).map((slide) => ({ ...slide, speakerNotes: item.notes || "" }));
      slides = slides.concat(songSlides);
    });
    return slides;
  }, [setlist, linesPerSlide]);

  useEffect(() => {
    if (window.anointedDesktop) {
      const channel = new BroadcastChannel(`setlist_${setlist.id}`);
      const receive = (message: MessageEvent<{ event?: string; payload?: unknown }>) => {
        const payload = record(message.data?.payload);
        if (!payload) return;
        if (message.data.event === "settings_sync") {
          if (typeof payload.linesPerSlide === "number") setLinesPerSlide(payload.linesPerSlide);
        }
        if (message.data.event === "projector_sync") {
          if (payload.slide !== undefined) {
            const slide = confidenceSlide(payload.slide);
            setActiveSlideId(slide?.id || (typeof payload.activeSlideId === "string" ? payload.activeSlideId : null));
            setLiveSlide(slide);
            setLiveNextSlide(confidenceSlide(payload.nextSlide));
            setLiveNotes(typeof payload.speakerNotes === "string" ? payload.speakerNotes : "");
          }
        }
        if (message.data.event === "stage_sync") {
          if (typeof payload.stageMessage === "string") setStageMessage(payload.stageMessage);
          const flash = stageFlash(payload.stageFlashStyle);
          if (flash) setStageFlashStyle(flash);
          if (payload.countdownTarget === null || typeof payload.countdownTarget === "number") setCountdownTarget(payload.countdownTarget);
          if (payload.countdownPausedMs === null || typeof payload.countdownPausedMs === "number") setPausedCountdownMs(payload.countdownPausedMs);
          if (payload.stageLayout) setStageLayout(mergedStageLayout(payload.stageLayout));
        }
      };
      channel.addEventListener("message", receive);
      channel.postMessage({ event: "presentation_state_request", payload: { output: "confidence" } });
      queueMicrotask(() => setIsConnected(true));
      return () => { channel.removeEventListener("message", receive); channel.close(); };
    }
    if (!supabase) return;
    const channel = supabase.channel(`setlist_${setlist.id}`);

    channel
      .on("broadcast", { event: "settings_sync" }, (event: { payload?: unknown }) => {
        const payload = record(event.payload);
        if (typeof payload?.linesPerSlide === "number") {
          setLinesPerSlide(payload.linesPerSlide);
        }
      })
      .on("broadcast", { event: "projector_sync" }, (event: { payload?: unknown }) => {
        const payload = record(event.payload);
        if (payload) {
          if (payload.slide !== undefined) {
            const slide = confidenceSlide(payload.slide);
            setActiveSlideId(slide?.id || null);
            setLiveSlide(slide);
            setLiveNextSlide(confidenceSlide(payload.nextSlide));
            setLiveNotes(typeof payload.speakerNotes === "string" ? payload.speakerNotes : "");
          }
        }
      })
      .on("broadcast", { event: "stage_sync" }, (event: { payload?: unknown }) => {
        const payload = record(event.payload);
        if (payload) {
          if (typeof payload.stageMessage === "string") {
            setStageMessage(payload.stageMessage);
          }
          const flash = stageFlash(payload.stageFlashStyle);
          if (flash) setStageFlashStyle(flash);
          if (payload.countdownTarget === null || typeof payload.countdownTarget === "number") {
            setCountdownTarget(payload.countdownTarget);
          }
          if (payload.countdownPausedMs === null || typeof payload.countdownPausedMs === "number") {
            setPausedCountdownMs(payload.countdownPausedMs);
          }
          if (payload.stageLayout) setStageLayout(mergedStageLayout(payload.stageLayout));
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
      {stageLayout.showNotes && (liveNotes || currentSlide?.speakerNotes) && <div className="absolute bottom-4 left-4 right-4 rounded bg-white/5 px-4 py-2 text-center text-lg font-semibold text-amber-200">{liveNotes || currentSlide?.speakerNotes}</div>}
    </div>
  );
}
