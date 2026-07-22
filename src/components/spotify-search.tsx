"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Play, Square, ExternalLink } from "lucide-react";

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
  preview_url?: string | null;
};

export function SpotifySearch({
  onSelect,
}: {
  onSelect: (track: SpotifyTrack) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (playingAudio) {
        playingAudio.pause();
      }
    };
  }, [playingAudio]);

  const searchSpotify = async (q: string) => {
    setQuery(q);
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const togglePreview = (e: React.MouseEvent, track: SpotifyTrack) => {
    e.stopPropagation();
    
    if (playingTrackId === track.id) {
      setPlayingTrackId(null);
    } else {
      setPlayingTrackId(track.id);
    }
  };

  return (
    <div className="relative z-50">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          <Search className="size-4" />
        </span>
        <Input
          value={query}
          onChange={(e) => searchSpotify(e.target.value)}
          placeholder="Search Spotify to autofill..."
          className="pl-9 h-10 border-green-500/50 bg-[#17161b] focus:border-green-500 focus:ring-1 focus:ring-green-500/30"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
            <Loader2 className="size-4 animate-spin" />
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-[400px] overflow-auto rounded-xl border border-white/10 bg-[#17161b] p-1 shadow-2xl">
          {results.map((track) => (
            <div key={track.id} className="flex flex-col border-b border-white/5 last:border-0">
              <button
                type="button"
                onClick={() => {
                  onSelect(track);
                  setOpen(false);
                  setQuery("");
                  setPlayingTrackId(null);
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5 transition group"
              >
                {track.album.images[0]?.url ? (
                  <img
                    src={track.album.images[0].url}
                    alt={track.album.name}
                    className="size-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="size-10 rounded-md bg-white/10" />
                )}
                <div className="flex-1 truncate">
                  <div className="text-sm font-semibold text-white truncate">
                    {track.name}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {track.artists.map((a) => a.name).join(", ")}
                  </div>
                </div>
                <div 
                  onClick={(e) => togglePreview(e, track)}
                  className="flex size-8 items-center justify-center rounded-full bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition opacity-0 group-hover:opacity-100 mr-1"
                  title="Preview in browser"
                >
                  {playingTrackId === track.id ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <Play className="size-3.5 fill-current ml-0.5" />
                  )}
                </div>
              </button>
              {playingTrackId === track.id && (
                <div className="p-2 animate-fade-in">
                  <iframe 
                    src={`https://open.spotify.com/embed/track/${track.id}`} 
                    width="100%" 
                    height="80" 
                    frameBorder="0" 
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                    loading="lazy" 
                    className="rounded-lg"
                  ></iframe>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
