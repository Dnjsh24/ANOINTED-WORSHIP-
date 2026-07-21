"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  external_urls: { spotify: string };
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
        <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-xl border border-white/10 bg-[#17161b] p-1 shadow-2xl">
          {results.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                onSelect(track);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/5 transition"
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
