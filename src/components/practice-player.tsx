"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  AlertTriangle,
  Video,
  Music,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import {
  type MediaProvider,
  type PlaybackState,
  type PracticeSetlistSong,
  getPreferredProvider,
  getSpotifyTrackInfo,
  getYouTubeVideoId,
} from "@/lib/domain/practice";
import { cn } from "@/lib/utils";

// YouTube IFrame API global type declarations
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        config: {
          videoId?: string;
          events?: {
            onReady?: (event: { target: unknown }) => void;
            onStateChange?: (event: { data: number; target: unknown }) => void;
            onError?: (event: { data: number }) => void;
          };
          playerVars?: Record<string, unknown>;
        },
      ) => unknown;
      PlayerState?: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
  }
}

interface PracticePlayerProps {
  activeSong: PracticeSetlistSong;
  isFirstSong: boolean;
  isLastSong: boolean;
  onPreviousSong: () => void;
  onNextSong: () => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}

export function PracticePlayer({
  activeSong,
  isFirstSong,
  isLastSong,
  onPreviousSong,
  onNextSong,
  onPlaybackStateChange,
}: PracticePlayerProps) {
  const ytVideoId = getYouTubeVideoId(activeSong.youtubeUrl);
  const spotifyInfo = getSpotifyTrackInfo(activeSong.spotifyUrl);

  const hasYouTube = Boolean(ytVideoId);
  const hasSpotify = Boolean(spotifyInfo);

  const defaultProvider = getPreferredProvider(activeSong.youtubeUrl, activeSong.spotifyUrl);

  // Derived state pattern for song switching during render without sync effect setStates
  const [prevSlotId, setPrevSlotId] = useState(activeSong.slotId);
  const [overrideProvider, setOverrideProvider] = useState<MediaProvider | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(defaultProvider ? "ready" : "unavailable");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSetComplete, setIsSetComplete] = useState(false);

  if (prevSlotId !== activeSong.slotId) {
    setPrevSlotId(activeSong.slotId);
    setOverrideProvider(null);
    setPlaybackState(defaultProvider ? "ready" : "unavailable");
    setCurrentTime(0);
    setDuration(0);
    setIsSetComplete(false);
  }

  const provider = overrideProvider ?? defaultProvider;

  // React useId for safe DOM element ID without impure Math.random during render
  const containerId = useId();
  const ytContainerDomId = `yt-player-${containerId.replace(/:/g, "")}`;

  // Player DOM refs
  const ytPlayerRef = useRef<unknown | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // Track ended callback
  const handleTrackEnded = useCallback(() => {
    setPlaybackState("ended");
    onPlaybackStateChange?.(false);

    if (isLastSong) {
      setIsSetComplete(true);
    } else {
      onNextSong();
    }
  }, [isLastSong, onNextSong, onPlaybackStateChange, setPlaybackState, setIsSetComplete]);

  // Clean up progress polling
  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Destroy YouTube Player instance
  const destroyYtPlayer = useCallback(() => {
    clearProgressInterval();
    if (ytPlayerRef.current) {
      try {
        const player = ytPlayerRef.current as { destroy?: () => void };
        if (typeof player.destroy === "function") {
          player.destroy();
        }
      } catch (err) {
        console.error("Error destroying YT player:", err);
      }
      ytPlayerRef.current = null;
    }
  }, [clearProgressInterval]);

  // Load YouTube IFrame API script dynamically
  const ensureYtApi = useCallback((callback: () => void) => {
    if (window.YT && window.YT.Player) {
      callback();
      return;
    }

    const existingScript = document.getElementById("yt-iframe-api-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "yt-iframe-api-script";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      callback();
    };
  }, []);

  // Initialize YouTube Player
  useEffect(() => {
    if (provider !== "youtube" || !ytVideoId) {
      destroyYtPlayer();
      return;
    }

    let isMounted = true;

    ensureYtApi(() => {
      if (!isMounted) return;
      destroyYtPlayer();

      const containerEl = document.getElementById(ytContainerDomId);
      if (!containerEl) return;

      try {
        ytPlayerRef.current = new window.YT!.Player(ytContainerDomId, {
          videoId: ytVideoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: { target: unknown }) => {
              if (!isMounted) return;
              setPlaybackState("ready");
              try {
                const player = event.target as { getDuration?: () => number };
                const dur = player.getDuration?.();
                if (dur && !isNaN(dur)) setDuration(dur);
              } catch {
                // ignore
              }
            },
            onStateChange: (event: { data: number; target: unknown }) => {
              if (!isMounted) return;
              const state = event.data;
              if (state === window.YT?.PlayerState?.PLAYING) {
                setPlaybackState("playing");
                onPlaybackStateChange?.(true);
                clearProgressInterval();
                progressIntervalRef.current = window.setInterval(() => {
                  const player = ytPlayerRef.current as { getCurrentTime?: () => number; getDuration?: () => number } | null;
                  if (player?.getCurrentTime) {
                    const curr = player.getCurrentTime();
                    const dur = player.getDuration?.();
                    if (curr !== undefined) setCurrentTime(curr);
                    if (dur && !isNaN(dur)) setDuration(dur);
                  }
                }, 500);
              } else if (state === window.YT?.PlayerState?.PAUSED) {
                setPlaybackState("paused");
                onPlaybackStateChange?.(false);
                clearProgressInterval();
              } else if (state === window.YT?.PlayerState?.ENDED) {
                clearProgressInterval();
                handleTrackEnded();
              } else if (state === window.YT?.PlayerState?.BUFFERING) {
                setPlaybackState("loading");
              }
            },
            onError: (event: { data: number }) => {
              if (!isMounted) return;
              console.warn("YouTube player error:", event.data);
              setPlaybackState("unavailable");
              onPlaybackStateChange?.(false);
              clearProgressInterval();
            },
          },
        });
      } catch (err) {
        console.error("Failed to init YT Player:", err);
        setPlaybackState("unavailable");
      }
    });

    return () => {
      isMounted = false;
      destroyYtPlayer();
    };
  }, [provider, ytVideoId, ytContainerDomId, destroyYtPlayer, ensureYtApi, handleTrackEnded, onPlaybackStateChange, clearProgressInterval]);

  // Provider switching helper
  const handleToggleProvider = (newProvider: MediaProvider) => {
    if (newProvider === provider) return;

    // Pause existing playback
    if (provider === "youtube" && ytPlayerRef.current) {
      try {
        const player = ytPlayerRef.current as { pauseVideo?: () => void };
        player.pauseVideo?.();
      } catch {
        // ignore
      }
    }
    onPlaybackStateChange?.(false);
    clearProgressInterval();

    setOverrideProvider(newProvider);
    setPlaybackState("ready");
    setCurrentTime(0);
  };

  // User Play / Pause controls
  const handlePlayPause = () => {
    if (playbackState === "playing") {
      if (provider === "youtube" && ytPlayerRef.current) {
        try {
          const player = ytPlayerRef.current as { pauseVideo?: () => void };
          player.pauseVideo?.();
        } catch {
          // ignore
        }
      } else {
        setPlaybackState("paused");
      }
      onPlaybackStateChange?.(false);
    } else {
      if (provider === "youtube" && ytPlayerRef.current) {
        try {
          const player = ytPlayerRef.current as { playVideo?: () => void };
          player.playVideo?.();
        } catch {
          // fallback
          setPlaybackState("playing");
        }
      } else {
        setPlaybackState("playing");
      }
      onPlaybackStateChange?.(true);
      setIsSetComplete(false);
    }
  };

  // Seek bar handler
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (provider === "youtube" && ytPlayerRef.current) {
      try {
        const player = ytPlayerRef.current as { seekTo?: (seconds: number, allowSeekAhead: boolean) => void };
        player.seekTo?.(newTime, true);
      } catch {
        // ignore
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const canSeek = provider === "youtube" && duration > 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-zinc-900/90 p-4 shadow-lg backdrop-blur-md">
      {/* Top Header & Session Provider Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {provider === "youtube" ? (
            <Video className="size-5 text-red-500" />
          ) : (
            <Music className="size-5 text-emerald-500" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            {provider === "youtube" ? "YouTube Audio/Video" : "Spotify Preview Track"}
          </span>
        </div>

        {/* Session Provider Toggle (only if both URLs exist) */}
        {hasYouTube && hasSpotify && (
          <div className="inline-flex rounded-lg bg-zinc-800 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => handleToggleProvider("youtube")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                provider === "youtube"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white",
              )}
            >
              <Video className="size-3.5" />
              YouTube
            </button>
            <button
              type="button"
              onClick={() => handleToggleProvider("spotify")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                provider === "spotify"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white",
              )}
            >
              <Music className="size-3.5" />
              Spotify
            </button>
          </div>
        )}
      </div>

      {/* Embed Container Area */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black border border-white/10 flex items-center justify-center">
        {provider === "youtube" && ytVideoId && (
          <div className="h-full w-full">
            <div id={ytContainerDomId} className="h-full w-full" />
          </div>
        )}

        {provider === "spotify" && spotifyInfo && (
          <div className="h-full w-full p-2 flex flex-col justify-center bg-zinc-950">
            <iframe
              ref={iframeRef}
              src={spotifyInfo.embedUrl}
              className="h-full w-full rounded-md border-0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title={`Spotify Player - ${activeSong.title}`}
            />
          </div>
        )}

        {/* Unavailable state or missing links */}
        {(!provider || playbackState === "unavailable") && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <AlertTriangle className="size-10 text-amber-500 mb-2" />
            <p className="text-sm font-semibold text-zinc-200">
              {!hasYouTube && !hasSpotify
                ? "No media player link available"
                : "Playback unavailable for this source"}
            </p>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              {!hasYouTube && !hasSpotify
                ? "Chords, lyrics, and metronome remain fully functional."
                : "The video or track may be private, removed, or restricted from embedding."}
            </p>

            {/* Fallback to other provider if available */}
            {hasYouTube && provider !== "youtube" && (
              <button
                type="button"
                onClick={() => handleToggleProvider("youtube")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500"
              >
                <Video className="size-4" /> Try YouTube Source
              </button>
            )}
            {hasSpotify && provider !== "spotify" && (
              <button
                type="button"
                onClick={() => handleToggleProvider("spotify")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <Music className="size-4" /> Try Spotify Source
              </button>
            )}
          </div>
        )}
      </div>

      {/* Set Complete Notice Badge */}
      {isSetComplete && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-950/80 border border-emerald-500/40 p-2.5 text-emerald-300 text-sm font-bold animate-fade-in">
          <CheckCircle2 className="size-5 text-emerald-400" />
          Set Complete! All setlist songs finished.
        </div>
      )}

      {/* Progress & Seek Bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          disabled={!canSeek || playbackState === "unavailable"}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Track playback position"
        />
      </div>

      {/* Controls Bar: Previous, Play/Pause, Next */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onPreviousSong}
          disabled={isFirstSong}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-800 px-3.5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 min-h-[44px]"
          aria-label="Previous setlist song"
        >
          <SkipBack className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        <button
          type="button"
          onClick={handlePlayPause}
          disabled={!provider || playbackState === "unavailable"}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-base font-bold text-white shadow-lg transition hover:bg-violet-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-600 min-h-[44px]"
          aria-label={playbackState === "playing" ? "Pause player" : "Play player"}
        >
          {playbackState === "playing" ? (
            <>
              <Pause className="size-5 fill-current" />
              Pause
            </>
          ) : (
            <>
              <Play className="size-5 fill-current ml-0.5" />
              Play
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onNextSong}
          disabled={isLastSong}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-800 px-3.5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 min-h-[44px]"
          aria-label="Next setlist song"
        >
          <span className="hidden sm:inline">Next</span>
          <SkipForward className="size-4" />
        </button>
      </div>

      {/* External Links */}
      <div className="flex items-center justify-end gap-3 text-xs text-zinc-400 pt-1">
        {activeSong.youtubeUrl && (
          <a
            href={activeSong.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-red-400"
          >
            YouTube <ExternalLink className="size-3" />
          </a>
        )}
        {activeSong.spotifyUrl && (
          <a
            href={activeSong.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-emerald-400"
          >
            Spotify <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}
