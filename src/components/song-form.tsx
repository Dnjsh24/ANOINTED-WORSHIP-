"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createSongAction, updateSongAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { formatSongToText } from "@/lib/domain/chords";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Key, Mic, MicOff, Trash2 } from "lucide-react";
import { PitchDetector, type PitchDetectorState } from "@/lib/pitch-detector";

export function SongForm({ song }: { song?: Song }) {
  const [state, formAction] = useActionState(song ? updateSongAction : createSongAction, initialActionState);
  const [activeTab, setActiveTab] = useState<"chords" | "lyrics">("chords");
  const [tags, setTags] = useState(song?.tags?.join(", ") ?? "Worship, Contemporary");
  const [lyrics, setLyrics] = useState(song ? formatSongToText(song) : "");
  const [songStatus, setSongStatus] = useState("");
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const [detectorState, setDetectorState] = useState<PitchDetectorState>({ status: "idle" });
  const detectorRef = useRef<PitchDetector | null>(null);

  const handleDetect = useCallback(async () => {
    if (detectorRef.current) {
      const result = detectorRef.current.stop();
      const key = document.querySelector<HTMLSelectElement>("select[name=originalKey]");
      if (result && key) {
        key.value = result;
      }
      detectorRef.current = null;
      setDetectorState({ status: "idle" });
      return;
    }
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isStandalone && isIOS) {
      setDetectorState({ status: "error", message: "Mic isn't available when added to home screen. Tap Share → Open in Safari, then try again." });
      return;
    }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDetectorState({ status: "error", message: "Your browser doesn't support microphone access." });
        return;
      }
      const ctx = new AudioContext();
      await ctx.resume();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const detector = new PitchDetector(ctx, stream, (state) => setDetectorState(state));
      detectorRef.current = detector;
      detector.start();
    } catch (e) {
      const err = e as DOMException;
      let msg = `[${err.name}] ${err.message}`;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        if (isIOS && isStandalone) {
          msg = "Mic isn't available when added to home screen. Tap Share → Open in Safari, then try again.";
        } else if (isIOS) {
          msg = "Open iPhone Settings → Safari → Microphone → Allow. Then refresh.";
        } else {
          msg = "Allow mic access in your browser or OS settings for this site, then refresh.";
        }
      }
      setDetectorState({ status: "error", message: msg });
    }
  }, []);

  useEffect(() => {
    return () => {
      detectorRef.current?.cleanup();
    };
  }, []);

  return (
    <form action={formAction} className="space-y-6 text-left animate-fade-in">
      {song && <input type="hidden" name="songId" value={song.id} />}
      <ActionMessage state={state} />
      {songStatus ? (
        <p aria-live="polite" className="rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-100">
          {songStatus}
        </p>
      ) : null}

      {/* 2-Column Split Layout */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        
        {/* Left Column: Details */}
        <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5">
          <h3 className="text-sm font-bold text-white mb-2 pb-2 border-b border-white/[0.04]">Song Details</h3>
          
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Song Title *</span>
            <Input name="title" defaultValue={song?.title} placeholder="e.g., Your Faithfulness" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Artist / Source *</span>
            <Input name="artist" defaultValue={song?.artist} placeholder="e.g., Brandon Lake" required />
          </label>

          {/* Key with picker icon next to it */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">Default Key *</span>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    name="originalKey"
                    defaultValue={song?.originalKey ?? "C"}
                    className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                    required
                  >
                    {["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"].map((key) => (
                      <option key={key} value={key} className="bg-[#111014]">{key}</option>
                    ))}
                  </select>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                    <Key className="size-4 text-violet-400" />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDetect}
                  title="Detect key by singing/humming"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#17161b] hover:bg-violet-600/20 transition-colors"
                >
                  {detectorState.status === "listening" ? (
                    <span className="relative flex items-center justify-center">
                      <MicOff className="size-4 text-red-400" />
                      <span className="absolute -top-1 -right-1 flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                      </span>
                    </span>
                  ) : (
                    <Mic className="size-4 text-zinc-400" />
                  )}
                </button>
              </div>
              {detectorState.status === "listening" && (
                <p className="mt-1 text-xs font-semibold text-violet-300">
                  Detected: <span className="text-white">{detectorState.detected}</span> — tap mic again to set
                </p>
              )}
              {detectorState.status === "error" && (
                <p className="mt-1 text-xs font-semibold text-red-400">{detectorState.message}</p>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">BPM *</span>
              <Input type="number" name="bpm" min={40} max={240} defaultValue={song?.bpm ?? 72} required />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Time Signature *</span>
            <div className="relative">
              <select
                name="timeSignature"
                defaultValue={song?.timeSignature ?? "4/4"}
                className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#17161b] px-3 text-sm font-semibold text-white outline-none focus:border-violet-400"
                required
              >
                <option value="4/4" className="bg-[#111014]">4/4</option>
                <option value="3/4" className="bg-[#111014]">3/4</option>
                <option value="6/8" className="bg-[#111014]">6/8</option>
              </select>
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Tags (Optional)</span>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Worship, Contemporary" className="h-10 text-xs font-semibold" />
            {/* hidden field to persist tags mapping */}
            <input type="hidden" name="tags" value={tags} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">YouTube Link (Optional)</span>
            <Input name="youtubeUrl" defaultValue={song?.youtubeUrl} placeholder="https://youtube.com/watch?v=..." className="h-10 text-xs font-semibold" />
          </label>
        </div>

        {/* Right Column: Edit Sheet */}
        <div className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-5 flex flex-col min-h-[380px]">
          {/* Tab selector */}
          <div className="flex border-b border-white/[0.08] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("chords")}
              className={cn(
                "px-5 py-2.5 font-bold transition border-b-2 -mb-px",
                activeTab === "chords" ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-white"
              )}
            >
              Chords
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("lyrics")}
              className={cn(
                "px-5 py-2.5 font-bold transition border-b-2 -mb-px",
                activeTab === "lyrics" ? "border-violet-500 text-violet-300" : "border-transparent text-zinc-500 hover:text-white"
              )}
            >
              Lyrics
            </button>
          </div>

          {/* Textarea */}
          <div className="flex-1 min-h-[220px]">
            <textarea
              ref={lyricsRef}
              name="lyrics"
              value={lyrics}
              onChange={(event) => setLyrics(event.target.value)}
              placeholder="Intro&#10;C   C   G   Am   F   C&#10;&#10;Verse 1&#10;C&#10;You are faithful, always faithful..."
              required
              className="w-full h-full min-h-[220px] rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-xs text-white outline-none transition placeholder:text-zinc-500 focus:border-violet-400"
            />
          </div>

        </div>

      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.04]">
        <div>
          {song && (
            <button
              type="button"
              onClick={() => setSongStatus("Song deletion needs an admin confirmation flow before it can remove live data.")}
              className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="size-3.5" />
              Delete Song
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ButtonLink href={song ? `/songs/${song.id}` : "/songs"} variant="secondary" className="rounded-xl px-6 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08]">
            Cancel
          </ButtonLink>
          <SubmitButton className="rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-violet-500 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]">
            {song ? "Save Song" : "Create Song"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
