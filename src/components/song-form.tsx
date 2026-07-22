"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSongAction, updateSongAction, deleteSongAction } from "@/app/actions";
import { ActionMessage, SubmitButton } from "@/components/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { formatSongToText } from "@/lib/domain/chords";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Key, Mic, MicOff, Music, Trash2 } from "lucide-react";
import { detectKeyFromText } from "@/lib/detect-key-from-chords";
import { VoiceKeyDetector } from "@/lib/voice-key-detector";
import { SpotifySearch, type SpotifyTrack } from "./spotify-search";

export function SongForm({ song }: { song?: Song }) {
  const [state, formAction] = useActionState(song ? updateSongAction : createSongAction, initialActionState);
  const [activeTab, setActiveTab] = useState<"chords" | "lyrics">("chords");
  const [tags, setTags] = useState(song?.tags?.join(", ") ?? "Worship, Contemporary");
  const [lyrics, setLyrics] = useState(song ? formatSongToText(song) : "");
  const [songStatus, setSongStatus] = useState("");
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const voiceDetectorRef = useRef<VoiceKeyDetector | null>(null);
  const voiceStopTimerRef = useRef<number | null>(null);
  const voiceCountdownIntervalRef = useRef<number | null>(null);
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState<number | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);
  
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const [spotifyUrl, setSpotifyUrl] = useState(song?.spotifyUrl ?? "");
  const [imageUrl, setImageUrl] = useState(song?.imageUrl ?? "");
  const [songAlbum, setSongAlbum] = useState(song?.album ?? "");

  const handleSpotifySelect = (track: SpotifyTrack) => {
    const titleInput = document.querySelector<HTMLInputElement>("input[name=title]");
    const artistInput = document.querySelector<HTMLInputElement>("input[name=artist]");
    
    if (titleInput) titleInput.value = track.name;
    if (artistInput) artistInput.value = track.artists.map(a => a.name).join(", ");
    
    setSongAlbum(track.album.name);
    setSpotifyUrl(track.external_urls.spotify);
    setImageUrl(track.album.images[0]?.url || "");
    setSongStatus("Imported from Spotify!");
  };

  const [transcribingNotes, setTranscribingNotes] = useState(false);
  const transcriptionDetectorRef = useRef<VoiceKeyDetector | null>(null);
  const lastTranscribedNoteRef = useRef<string | null>(null);

  const toggleTranscription = async () => {
    if (transcribingNotes) {
      if (transcriptionDetectorRef.current) {
        transcriptionDetectorRef.current.stop();
        transcriptionDetectorRef.current = null;
      }
      setTranscribingNotes(false);
      setDetectMessage("Transcription stopped.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDetectMessage("Microphone is not available in this browser.");
      return;
    }

    const userConfirmed = window.confirm("Allow microphone access for real-time live note transcription?");
    if (!userConfirmed) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      
      transcriptionDetectorRef.current = new VoiceKeyDetector(
        ctx,
        stream,
        (note, stableCount) => {
           if (stableCount === 3 && note !== lastTranscribedNoteRef.current && note !== "") {
             setLyrics((prev) => prev + (prev.endsWith(" ") || prev.length === 0 || prev.endsWith("\n") ? "" : " ") + note + " ");
             lastTranscribedNoteRef.current = note;
           } else if (stableCount === 0) {
             lastTranscribedNoteRef.current = null;
           }
        }
      );
      transcriptionDetectorRef.current.start(true);
      setTranscribingNotes(true);
      setDetectMessage("Transcribing... Play notes clearly. Highpass filter is active.");
    } catch (e) {
      console.error(e);
      setDetectMessage("Could not access microphone.");
    }
  };

  const handleDetectKeyFromChords = () => {
    const result = detectKeyFromText(lyrics);
    if (!result) {
      setDetectMessage("No chords found in the Chords/Lyrics tab.");
      return;
    }

    const select = document.querySelector<HTMLSelectElement>("select[name=originalKey]");
    if (select) {
      select.value = result.key;
    }
    const matchPct = Math.round(result.score * 100);
    const mode = result.mode === "minor" ? "minor" : "major";
    setDetectMessage(`Detected ${result.key} ${mode} (${result.matchCount}/${result.totalChords} chords fit, ${matchPct}% confidence)`);
  };

  const handleImportFromUrl = async () => {
    if (!importUrl) return;
    setIsImporting(true);
    setSongStatus("Importing chords...");
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import");
      }
      setLyrics(data.lyrics);
      if (data.title) {
        const titleInput = document.querySelector<HTMLInputElement>("input[name=title]");
        if (titleInput && !titleInput.value) titleInput.value = data.title;
      }
      setSongStatus("Imported successfully! Check lyrics/chords tab.");
      setImportUrl("");
      setActiveTab("chords");
      handleDetectKeyFromChords();
    } catch (err: any) {
      setSongStatus("Import failed: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDetectKeyFromVoice = async () => {
    const select = document.querySelector<HTMLSelectElement>("select[name=originalKey]");

    const clearVoiceTimers = () => {
      if (voiceStopTimerRef.current) {
        clearTimeout(voiceStopTimerRef.current);
        voiceStopTimerRef.current = null;
      }
      if (voiceCountdownIntervalRef.current) {
        clearInterval(voiceCountdownIntervalRef.current);
        voiceCountdownIntervalRef.current = null;
      }
      setVoiceSecondsLeft(null);
    };

    const finishVoiceDetection = (isAutoStop: boolean) => {
      if (!voiceDetectorRef.current) return;
      const result = voiceDetectorRef.current.stop();
      voiceDetectorRef.current = null;
      clearVoiceTimers();
      setVoiceListening(false);
      setVoiceLevel(0);

      if (result.status === "ok") {
        if (select) {
          select.value = result.key;
        }
        const pct = Math.round(result.confidence * 100);
        const prefix = isAutoStop ? "10s scan complete." : "Voice scan stopped.";
        setDetectMessage(`${prefix} Detected ${result.key} ${result.mode} (${pct}% confidence). Top sung note: ${result.topNote ?? "-"}.`);
      } else {
        setDetectMessage(`${result.message} Captured ${result.sampleCount} pitch frames across ${result.uniquePitchClasses} note classes.`);
      }
    };

    if (voiceDetectorRef.current) {
      finishVoiceDetection(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDetectMessage("Microphone is not available in this browser.");
      return;
    }

    const userConfirmed = window.confirm("Allow microphone access for a 10-second acapella key scan?");
    if (!userConfirmed) {
      setDetectMessage("Microphone access cancelled.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      await ctx.resume();

      const detector = new VoiceKeyDetector(ctx, stream, (note, stableCount) => {
        setDetectMessage(`Scanning voice... ${note} (${stableCount} stable frames).`);
      }, (level) => {
        setVoiceLevel(level);
      });

      voiceDetectorRef.current = detector;
      setVoiceListening(true);
      setVoiceSecondsLeft(10);
      setDetectMessage("Scanning voice for 10 seconds... sing your acapella phrase now.");

      voiceStopTimerRef.current = window.setTimeout(() => {
        finishVoiceDetection(true);
      }, 10_000);

      voiceCountdownIntervalRef.current = window.setInterval(() => {
        setVoiceSecondsLeft((prev) => {
          if (!prev || prev <= 1) return 1;
          return prev - 1;
        });
      }, 1_000);

      detector.start();
    } catch (e) {
      const err = e as DOMException;
      clearVoiceTimers();
      setDetectMessage(`[${err.name}] ${err.message}`);
      setVoiceListening(false);
      setVoiceLevel(0);
    }
  };

  useEffect(() => {
    return () => {
      if (voiceStopTimerRef.current) clearTimeout(voiceStopTimerRef.current);
      if (voiceCountdownIntervalRef.current) clearInterval(voiceCountdownIntervalRef.current);
      voiceDetectorRef.current?.cleanup();
      voiceDetectorRef.current = null;
      transcriptionDetectorRef.current?.cleanup();
      transcriptionDetectorRef.current = null;
      setVoiceLevel(0);
    };
  }, []);

  return (
    <form action={formAction} className="space-y-6 text-left animate-fade-in">
      {song && <input type="hidden" name="songId" value={song.id} />}
      <input type="hidden" name="spotifyUrl" value={spotifyUrl} />
      <input type="hidden" name="imageUrl" value={imageUrl} />
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

          <div className="mb-4">
            <SpotifySearch onSelect={handleSpotifySelect} />
          </div>

          <div className="flex gap-2 mb-4">
            <Input 
              value={importUrl} 
              onChange={e => setImportUrl(e.target.value)} 
              placeholder="Paste WorshipChords.com URL to auto-import..." 
              className="h-9 text-xs"
            />
            <button
              type="button"
              onClick={handleImportFromUrl}
              disabled={isImporting || !importUrl}
              className="shrink-0 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white disabled:opacity-50 transition"
            >
              {isImporting ? "Importing..." : "Import"}
            </button>
          </div>
          
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Song Title *</span>
            <Input name="title" defaultValue={song?.title} placeholder="e.g., Your Faithfulness" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Artist / Source *</span>
            <Input name="artist" defaultValue={song?.artist} placeholder="e.g., Brandon Lake" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Album (Optional)</span>
            <Input name="album" value={songAlbum} onChange={(e) => setSongAlbum(e.target.value)} placeholder="e.g., Coat of Many Colors" />
          </label>

          {/* Key with picker icon next to it */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDetectKeyFromChords}
                    title="Detect from chords"
                    className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-[#17161b] hover:bg-violet-600/20 transition-colors"
                  >
                    <Music className="size-4 text-zinc-400" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDetectKeyFromVoice}
                    title="Detect from voice (acapella)"
                    className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-[#17161b] hover:bg-violet-600/20 transition-colors"
                  >
                    {voiceListening ? <MicOff className="size-4 text-red-400" /> : <Mic className="size-4 text-zinc-400" />}
                  </button>
                </div>
              </div>
              {detectMessage && (
                <p className="mt-1 text-xs font-semibold text-violet-300">{detectMessage}</p>
              )}
              {voiceListening && voiceSecondsLeft !== null && (
                <div className="mt-1 space-y-1">
                  <p className="text-xs font-semibold text-amber-300">Acapella scan: {voiceSecondsLeft}s remaining</p>
                  <div className="flex items-end gap-1" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, index) => {
                      const threshold = (index + 1) / 10;
                      const active = voiceLevel >= threshold;
                      return (
                        <span
                          key={index}
                          className={cn(
                            "w-1.5 rounded-sm transition-all",
                            active ? "bg-emerald-400" : "bg-white/10",
                          )}
                          style={{ height: `${8 + index * 2}px` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">BPM (Optional)</span>
              <Input type="number" name="bpm" min={40} max={240} defaultValue={song?.bpm ?? ""} />
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
          <div className="flex border-b border-white/[0.08] text-xs justify-between items-end">
            <div className="flex">
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
            <button
               type="button"
               onClick={toggleTranscription}
               title="Live Note Transcription"
               className={cn(
                 "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[10px] font-bold transition uppercase tracking-wider mb-0 mr-1 border-b-2 -mb-px",
                 transcribingNotes ? "border-red-500 text-red-400 hover:text-red-300 bg-red-500/10" : "border-transparent text-zinc-400 hover:text-white hover:bg-white/[0.04]"
               )}
            >
               {transcribingNotes ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
               {transcribingNotes ? "Stop" : "Mic Transcribe"}
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
              type="submit"
              formAction={deleteSongAction}
              onClick={(e) => {
                if (!window.confirm("Are you sure you want to delete this song? This action cannot be undone.")) {
                  e.preventDefault();
                }
              }}
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
