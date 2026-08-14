"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Play, Square, Volume2, BookmarkCheck, Clock, Plus, Minus } from "lucide-react";
import { type PracticeSetlistSong, parseTimeSignature } from "@/lib/domain/practice";
import { updateSongBpmAction } from "@/app/actions";
import { cn } from "@/lib/utils";

interface PracticeMetronomeProps {
  activeSong: PracticeSetlistSong;
  setlistId?: string;
  canEditSong: boolean;
  isPlayerPlaying?: boolean;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playClick(beat: number, volume: number) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Accent beat 1 with a higher pitch (1200 Hz), other beats at 700 Hz
    if (beat === 1) {
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
    } else {
      osc.frequency.setValueAtTime(700, ctx.currentTime);
    }

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch (err) {
    console.error("Metronome audio click error:", err);
  }
}

export function PracticeMetronome({
  activeSong,
  setlistId,
  canEditSong,
  isPlayerPlaying,
}: PracticeMetronomeProps) {
  const initialBpm = activeSong.bpm && activeSong.bpm >= 40 && activeSong.bpm <= 240 ? activeSong.bpm : null;
  const [bpm, setBpm] = useState<number | null>(initialBpm);
  const [savedBpm, setSavedBpm] = useState<number | null>(initialBpm);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [startWithPlayer, setStartWithPlayer] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const timeSig = parseTimeSignature(activeSong.timeSignature);
  const intervalRef = useRef<number | null>(null);
  const beatRef = useRef(1);

  // Stop metronome and update BPM whenever active song changes
  useEffect(() => {
    setIsPlaying(false);
    const newBpm = activeSong.bpm && activeSong.bpm >= 40 && activeSong.bpm <= 240 ? activeSong.bpm : null;
    setBpm(newBpm);
    setSavedBpm(newBpm);
    setSaveMessage(null);
  }, [activeSong.slotId, activeSong.bpm]);

  // "Start with player" synchronization
  useEffect(() => {
    if (!startWithPlayer) return;
    if (isPlayerPlaying) {
      if (bpm && bpm >= 40 && bpm <= 240) {
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(false);
    }
  }, [isPlayerPlaying, startWithPlayer, bpm]);

  // Metronome beat tick interval runner
  useEffect(() => {
    if (!isPlaying || !bpm || bpm < 40 || bpm > 240) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      beatRef.current = 1;
      setCurrentBeat(1);
      return;
    }

    const intervalMs = (60 / bpm) * 1000;
    beatRef.current = 1;
    setCurrentBeat(1);
    playClick(1, volume);

    intervalRef.current = window.setInterval(() => {
      let nextBeat = beatRef.current + 1;
      if (nextBeat > timeSig.beatsPerMeasure) {
        nextBeat = 1;
      }
      beatRef.current = nextBeat;
      setCurrentBeat(nextBeat);
      playClick(nextBeat, volume);
    }, intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, bpm, timeSig.beatsPerMeasure, volume]);

  // Tap tempo handler
  const handleTap = () => {
    const now = Date.now();
    setTapTimes((prev) => {
      const recent = prev.filter((t) => now - t < 3000);
      const updated = [...recent, now];
      if (updated.length > 1) {
        const intervals: number[] = [];
        for (let i = 1; i < updated.length; i++) {
          intervals.push(updated[i] - updated[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const calculatedBpm = Math.round(60000 / avgInterval);
        const clampedBpm = Math.min(240, Math.max(40, calculatedBpm));
        setBpm(clampedBpm);
      }
      return updated;
    });
  };

  const handleBpmChange = (newVal: number) => {
    const clamped = Math.min(240, Math.max(40, newVal));
    setBpm(clamped);
  };

  const handleSaveBpm = () => {
    if (!bpm || !canEditSong || !activeSong.songId) return;

    const formData = new FormData();
    formData.set("songId", activeSong.songId);
    formData.set("bpm", bpm.toString());
    if (setlistId) formData.set("setlistId", setlistId);

    startTransition(async () => {
      const result = await updateSongBpmAction(formData);
      if (result.ok) {
        setSavedBpm(bpm);
        setSaveMessage("Saved BPM to song");
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage(result.message || "Failed to save BPM");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-zinc-900/90 p-4 shadow-lg backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-violet-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Metronome
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <span>Time: <strong className="text-zinc-200">{timeSig.display}</strong></span>
          <span className="text-zinc-600">•</span>
          {savedBpm ? (
            <span className="text-emerald-400">Saved BPM: <strong>{savedBpm}</strong></span>
          ) : (
            <span className="text-amber-400">BPM not set</span>
          )}
        </div>
      </div>

      {/* BPM Controls and Visual Beat Indicator */}
      <div className="flex flex-col items-center gap-3 py-2 bg-zinc-950/60 rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => bpm && handleBpmChange(bpm - 1)}
            disabled={!bpm || bpm <= 40}
            className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            aria-label="Decrease BPM by 1"
          >
            <Minus className="size-5" />
          </button>

          <div className="flex flex-col items-center">
            <input
              type="number"
              min={40}
              max={240}
              value={bpm ?? ""}
              placeholder="--"
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setBpm(val);
                else setBpm(null);
              }}
              className="w-24 text-center font-mono text-3xl font-extrabold text-white bg-transparent border-b-2 border-violet-500/50 focus:border-violet-400 focus:outline-none"
              aria-label="Target BPM"
            />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mt-1">
              BPM (40–240)
            </span>
          </div>

          <button
            type="button"
            onClick={() => bpm && handleBpmChange(bpm + 1)}
            disabled={!bpm || bpm >= 240}
            className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            aria-label="Increase BPM by 1"
          >
            <Plus className="size-5" />
          </button>

          <button
            type="button"
            onClick={handleTap}
            className="ml-2 flex h-10 items-center justify-center rounded-lg bg-zinc-800 px-3.5 text-xs font-extrabold uppercase text-violet-300 border border-violet-500/30 hover:bg-violet-900/40 active:scale-95 transition-transform"
          >
            Tap Tempo
          </button>
        </div>

        {/* Beat Accent Visual Dots */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {Array.from({ length: timeSig.beatsPerMeasure }, (_, i) => i + 1).map((b) => (
            <div
              key={b}
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                isPlaying && currentBeat === b
                  ? b === 1
                    ? "bg-red-500 text-white scale-125 shadow-lg shadow-red-500/50"
                    : "bg-violet-500 text-white scale-110 shadow-md shadow-violet-500/50"
                  : "bg-zinc-800 text-zinc-400 border border-white/10",
              )}
            >
              {b}
            </div>
          ))}
        </div>
      </div>

      {/* Main Start / Stop & Volume Control */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!bpm || bpm < 40 || bpm > 240) return;
              setIsPlaying(!isPlaying);
            }}
            disabled={!bpm || bpm < 40 || bpm > 240}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white shadow-md transition min-h-[44px]",
              isPlaying
                ? "bg-red-600 hover:bg-red-500"
                : "bg-violet-600 hover:bg-violet-500 disabled:opacity-40",
            )}
          >
            {isPlaying ? (
              <>
                <Square className="size-4 fill-current" /> Stop Metronome
              </>
            ) : (
              <>
                <Play className="size-4 fill-current ml-0.5" /> Start Metronome
              </>
            )}
          </button>

          {canEditSong && (
            <button
              type="button"
              onClick={handleSaveBpm}
              disabled={!bpm || isPending}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-3 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900/80 disabled:opacity-40 min-h-[44px]"
            >
              <BookmarkCheck className="size-4" />
              {isPending ? "Saving..." : "Save BPM to Song"}
            </button>
          )}
        </div>

        {saveMessage && (
          <p className="text-center text-xs font-semibold text-emerald-400 animate-fade-in">
            {saveMessage}
          </p>
        )}

        {/* Volume Slider */}
        <div className="flex items-center gap-3 px-1">
          <Volume2 className="size-4 text-zinc-400" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-violet-500"
            aria-label="Metronome volume"
          />
          <span className="w-8 text-right font-mono text-xs font-semibold text-zinc-400">
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* Start with player synchronization option */}
        <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={startWithPlayer}
              onChange={(e) => setStartWithPlayer(e.target.checked)}
              className="size-4 rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-violet-500"
            />
            <span>Start metronome with player</span>
          </label>
          <p className="text-[11px] text-zinc-400 pl-6">
            Synchronizes play/pause control state only; does not claim downbeat alignment with recording.
          </p>
        </div>
      </div>
    </div>
  );
}
