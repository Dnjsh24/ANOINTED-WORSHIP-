"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { capoSuggestion, progressionToNashville, transposeProgression } from "@/lib/domain/chords";
import { ChordDiagrams } from "@/components/chord-diagrams";
import type { Song } from "@/lib/types";
import Link from "next/link";
import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function getYouTubeEmbedId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

let audioCtx: AudioContext | null = null;

function playClick(beat: number, volume: number = 0.5) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (beat === 1) {
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    } else {
      osc.frequency.setValueAtTime(700, audioCtx.currentTime);
    }

    // Set gain value based on volume parameter
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error("Audio error:", e);
  }
}

export function SongViewer({ song }: { song: Song }) {
  const [selectedKey, setSelectedKey] = useState(song.currentKey);
  const [showNumbers] = useState(false);
  const [instrument, setInstrument] = useState<"piano" | "guitar" | "bass">("guitar");
  const [showChords] = useState(true);

  // Metronome State
  const [metronomePlaying, setMetronomePlaying] = useState(false);
  const [bpm, setBpm] = useState(song.bpm);
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [, setCurrentBeat] = useState(1);

  // Auto-Scroll State
  const [scrollPlaying, setScrollPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2); // choices: 1 (Very Slow), 2 (Slow), 3 (Medium), 4 (Fast), 5 (Very Fast)

  // Tab State: "chords" | "lyrics"
  const [activeTab, setActiveTab] = useState<"chords" | "lyrics">("chords");

  useEffect(() => {
    setMetronomePlaying(false);
    setScrollPlaying(false);
    setBpm(song.bpm);
    setSelectedKey(song.currentKey);
  }, [song.id, song.bpm, song.currentKey]);

  // Metronome Sound Loop
  useEffect(() => {
    if (!metronomePlaying) {
      return;
    }

    let beat = 1;
    setCurrentBeat(beat);
    playClick(beat, metronomeVolume);

    const intervalMs = (60 / bpm) * 1000;
    const timer = setInterval(() => {
      beat = beat === 4 ? 1 : beat + 1;
      setCurrentBeat(beat);
      playClick(beat, metronomeVolume);
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [metronomePlaying, bpm, metronomeVolume]);

  // Auto-Scroll Loop
  useEffect(() => {
    if (!scrollPlaying) {
      return;
    }

    // scrollSpeed mapping: 1 -> 0.1px, 2 -> 0.25px, 3 -> 0.5px, 4 -> 0.9px, 5 -> 1.5px
    const stepSpeedMap: Record<number, number> = {
      1: 0.08,
      2: 0.22,
      3: 0.45,
      4: 0.85,
      5: 1.45,
    };
    const step = stepSpeedMap[scrollSpeed] ?? 0.25;

    const timer = setInterval(() => {
      window.scrollBy({
        top: step,
        left: 0,
        behavior: "auto",
      });
    }, 30);

    return () => {
      clearInterval(timer);
    };
  }, [scrollPlaying, scrollSpeed]);

  const embedId = useMemo(() => getYouTubeEmbedId(song.youtubeUrl), [song.youtubeUrl]);
  const capo = useMemo(() => capoSuggestion(song.originalKey, selectedKey), [selectedKey, song.originalKey]);

  // Extract unique chords
  const uniqueChords = useMemo(() => {
    const set = new Set<string>();
    song.sections.forEach((section) => {
      section.lines.forEach((line) => {
        if (line.chords) {
          line.chords.split(/\s+/).forEach((chord) => {
            const trimmed = chord.trim();
            if (trimmed && trimmed !== "/") {
              const transposed = transposeProgression(trimmed, song.originalKey, selectedKey);
              set.add(transposed);
            }
          });
        }
      });
    });
    return Array.from(set);
  }, [song, selectedKey]);

  // Handle Transpose / Key change
  const originalKeyIndex = keys.indexOf(song.originalKey);
  const selectedKeyIndex = keys.indexOf(selectedKey);
  
  const transposeOffset = useMemo(() => {
    if (originalKeyIndex === -1 || selectedKeyIndex === -1) return 0;
    let diff = selectedKeyIndex - originalKeyIndex;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    return diff;
  }, [originalKeyIndex, selectedKeyIndex]);

  function changeKey(direction: number) {
    let nextIdx = (selectedKeyIndex + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    setSelectedKey(keys[nextIdx]);
  }

  function changeTranspose(direction: number) {
    let nextIdx = (selectedKeyIndex + direction) % 12;
    if (nextIdx < 0) nextIdx += 12;
    setSelectedKey(keys[nextIdx]);
  }

  // Tap Tempo Handler
  function handleTapTempo() {
    const now = Date.now();
    const newTaps = [...tapTimes, now].filter((t) => now - t < 3000); // keep taps from last 3 seconds
    setTapTimes(newTaps);

    if (newTaps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < newTaps.length; i++) {
        sum += newTaps[i] - newTaps[i - 1];
      }
      const avgIntervalMs = sum / (newTaps.length - 1);
      const calculatedBpm = Math.round(60000 / avgIntervalMs);
      if (calculatedBpm >= 40 && calculatedBpm <= 250) {
        setBpm(calculatedBpm);
      }
    }
  }

  return (
    <div className="space-y-6 text-left animate-fade-in">
      {/* Top Header Card */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white">{song.title}</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-400">{song.artist}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/songs/${song.id}/edit`}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]"
          >
            Edit Song
          </Link>
          <Link
            href="/setlists"
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]"
          >
            Add to Setlist
          </Link>
        </div>
      </div>

      {/* Controls Panel */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5 grid gap-4 sm:grid-cols-2 md:grid-cols-4 items-center">
        {/* Key Selector */}
        <div className="flex items-center justify-between border-r border-white/[0.06] pr-4 md:pr-6">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Key</span>
          <div className="flex items-center gap-2">
            <button onClick={() => changeKey(-1)} className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm font-bold">-</button>
            <span className="font-mono text-base font-extrabold text-white min-w-6 text-center">{selectedKey}</span>
            <button onClick={() => changeKey(1)} className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm font-bold">+</button>
          </div>
        </div>

        {/* Transpose Selector */}
        <div className="flex items-center justify-between border-r border-white/[0.06] px-4 md:px-6">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Transpose</span>
          <div className="flex items-center gap-2">
            <button onClick={() => changeTranspose(-1)} className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm font-bold">-</button>
            <span className="font-mono text-base font-extrabold text-white min-w-6 text-center">{transposeOffset > 0 ? `+${transposeOffset}` : transposeOffset}</span>
            <button onClick={() => changeTranspose(1)} className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-sm font-bold">+</button>
          </div>
        </div>

        {/* BPM Display (Original, not changeable here) */}
        <div className="flex items-center justify-between border-r border-white/[0.06] px-4 md:px-6">
          <span className="text-xs font-bold text-zinc-500 tracking-wide uppercase">BPM</span>
          <span className="font-mono text-base font-extrabold text-white mr-4">{song.bpm}</span>
        </div>

        {/* Time Signature */}
        <div className="flex items-center justify-between pl-4 md:pl-6">
          <span className="text-xs font-bold text-zinc-500 tracking-wide uppercase">Time Sig</span>
          <select defaultValue="4/4" className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-bold text-white outline-none focus:border-violet-400">
            <option value="4/4" className="bg-[#111014]">4/4</option>
            <option value="3/4" className="bg-[#111014]">3/4</option>
            <option value="6/8" className="bg-[#111014]">6/8</option>
          </select>
        </div>
      </div>

      {/* Chord Shapes Card on Top */}
      {showChords && uniqueChords.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/[0.04]">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Chord Shapes</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Instrument:</span>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as any)}
                className="bg-[#17161b] rounded-lg border border-white/10 px-2.5 py-1 text-xs font-bold text-violet-400 outline-none"
              >
                <option value="guitar" className="bg-[#111014] text-white">Guitar</option>
                <option value="piano" className="bg-[#111014] text-white">Piano</option>
                <option value="bass" className="bg-[#111014] text-white">Bass</option>
              </select>
            </div>
          </div>
          <ChordDiagrams
            uniqueChords={uniqueChords}
            instrument={instrument}
            showNumbers={showNumbers}
            selectedKey={selectedKey}
          />
        </div>
      )}

      {/* Tabs Menu (Chords and Lyrics only) */}
      <div className="flex border-b border-white/[0.08] text-xs">
        {[
          { id: "chords", label: "Chords" },
          { id: "lyrics", label: "Lyrics" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "px-5 py-3 font-semibold transition-all border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-violet-500 text-violet-300 font-bold"
                : "border-transparent text-zinc-500 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid split */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] items-start">
        {/* Left Column: Chord Chart Area */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/60 p-6 min-h-[400px]">
          <div className="space-y-6">
            {song.sections.map((section) => {
              const lower = section.label.toLowerCase();
              let sectionStyle = "w-full rounded-xl bg-white/[0.02] border border-white/[0.06] p-4";
              if (lower.includes("chorus")) {
                sectionStyle = "w-full rounded-xl bg-violet-950/10 border border-violet-500/10 p-4";
              } else if (lower.includes("intro")) {
                sectionStyle = "w-full rounded-xl bg-zinc-900/20 border border-zinc-700/20 p-4";
              } else if (lower.includes("bridge")) {
                sectionStyle = "w-full rounded-xl bg-amber-950/10 border border-amber-500/10 p-4";
              }

              return (
                <section key={section.label} className={sectionStyle}>
                  <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-wider text-violet-400">{section.label}</p>
                  <div className="space-y-3.5">
                    {section.lines.map((line, index) => (
                      <div key={`${line.lyric}-${index}`}>
                        {line.chords && activeTab === "chords" && (
                          <p className="font-mono font-bold text-violet-300 whitespace-pre-wrap tracking-wide text-sm mb-0.5">
                            {showNumbers
                              ? progressionToNashville(line.chords, song.originalKey)
                              : transposeProgression(line.chords, song.originalKey, selectedKey)}
                          </p>
                        )}
                        <p className="font-semibold text-zinc-100 text-[13px]">{line.lyric}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Right Column: Sidebar (Details, Audio, Practice Tools) */}
        <aside className="space-y-5">
          {/* Details Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-4 pb-2 border-b border-white/[0.04]">Details</h3>
            <div className="space-y-3.5 text-xs font-semibold text-zinc-400">
              <div className="flex justify-between">
                <span>Album</span>
                <span className="text-white font-bold">Arriving</span>
              </div>
              <div className="flex justify-between">
                <span>Genre</span>
                <span className="text-white font-bold">Worship</span>
              </div>
              <div className="flex justify-between">
                <span>Original Artist</span>
                <span className="text-white font-bold">{song.artist}</span>
              </div>
              <div className="flex justify-between">
                <span>Key</span>
                <span className="text-white font-bold">{song.originalKey}</span>
              </div>
              <div className="flex justify-between">
                <span>BPM</span>
                <span className="text-white font-bold">{song.bpm}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Signature</span>
                <span className="text-white font-bold">{song.timeSignature}</span>
              </div>
              <div className="flex justify-between">
                <span>Length</span>
                <span className="text-white font-bold">5:41</span>
              </div>
            </div>
          </div>

          {/* Audio Card */}
          {embedId && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-3 pb-2 border-b border-white/[0.04]">Audio</h3>
              <div className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-[#0d0c12]">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${embedId}?autoplay=0`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {/* Practice Tools Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5 space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 pb-2 border-b border-white/[0.04]">Practice Tools</h3>
            
            {/* Metronome Control block */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-white">Metronome</p>
                  <p className="text-[9px] text-zinc-500 font-semibold">{bpm} BPM</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMetronomePlaying((val) => !val)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition",
                    metronomePlaying ? "bg-red-500 text-white" : "bg-violet-600 text-white hover:bg-violet-500"
                  )}
                >
                  {metronomePlaying ? <Square className="size-3.5 fill-white" /> : <Play className="size-3.5 fill-white" />}
                </button>
              </div>

              {/* BPM Adjust Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase">
                  <span>Tempo</span>
                  <span>{bpm} BPM</span>
                </div>
                <input
                  aria-label="Metronome tempo"
                  type="range"
                  min="40"
                  max="250"
                  step="1"
                  value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  className="h-1.5 w-full appearance-none rounded-lg bg-white/[0.08] outline-none accent-violet-500"
                />
              </div>

              {/* Volume Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase">
                  <span>Volume</span>
                  <span>{Math.round(metronomeVolume * 100)}%</span>
                </div>
                <input
                  aria-label="Metronome volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={metronomeVolume}
                  onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  className="h-1.5 w-full appearance-none rounded-lg bg-white/[0.08] outline-none accent-violet-500"
                />
              </div>

              {/* Tap Tempo Button */}
              <button
                type="button"
                onClick={handleTapTempo}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-1.5 text-[10px] font-extrabold text-violet-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                🥁 Tap Tempo
              </button>
            </div>

            {/* Auto Scroll Control block */}
            <div className="space-y-3 pt-3 border-t border-white/[0.04]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-white">Auto-Scroll</p>
                  <p className="text-[9px] text-zinc-500 font-semibold">Hands-free sheet</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScrollPlaying((val) => !val)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition",
                    scrollPlaying ? "bg-red-500 text-white" : "bg-violet-600 text-white hover:bg-violet-500"
                  )}
                >
                  {scrollPlaying ? <Square className="size-3.5 fill-white" /> : <Play className="size-3.5 fill-white" />}
                </button>
              </div>

              {/* Speed choices selector */}
              <div className="space-y-1">
                <span className="block text-[9px] text-zinc-500 font-bold uppercase">Scroll Speed</span>
                <select
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(parseInt(e.target.value))}
                  className="h-8 w-full rounded-lg border border-white/10 bg-[#17161b] px-2 text-[10px] font-bold text-white outline-none focus:border-violet-400"
                >
                  <option value="1" className="bg-[#111014]">1 - Very Slow</option>
                  <option value="2" className="bg-[#111014]">2 - Slow</option>
                  <option value="3" className="bg-[#111014]">3 - Medium</option>
                  <option value="4" className="bg-[#111014]">4 - Fast</option>
                  <option value="5" className="bg-[#111014]">5 - Very Fast</option>
                </select>
              </div>
            </div>
          </div>
        </aside>
      </div>

    </div>
  );
}
