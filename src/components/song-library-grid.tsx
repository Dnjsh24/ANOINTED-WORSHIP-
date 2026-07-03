"use client";

import { Heart, Play, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleSongFavoriteAction } from "@/app/actions";
import { SearchBox } from "@/components/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Song } from "@/lib/types";

export function SongLibraryGrid({ songs }: { songs: Song[] }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(songs.filter((song) => song.favorite).map((song) => song.id)));
  const [status, setStatus] = useState("");
  const [statusOk, setStatusOk] = useState(true);
  const [isPending, startTransition] = useTransition();

  function toggleFavorite(song: Song) {
    const nextFavorite = !favoriteIds.has(song.id);
    const formData = new FormData();
    formData.set("songId", song.id);
    formData.set("favorite", String(nextFavorite));

    startTransition(async () => {
      const result = await toggleSongFavoriteAction(formData);
      setStatus(result.message);
      setStatusOk(result.ok);
      if (!result.ok) {
        return;
      }

      setFavoriteIds((current) => {
        const next = new Set(current);
        if (nextFavorite) {
          next.add(song.id);
        } else {
          next.delete(song.id);
        }
        return next;
      });
    });
  }

  return (
    <SearchBox placeholder="Search by title, artist, or tag...">
      {(query) => {
        const filteredSongs = songs.filter((song) => {
          const haystack = `${song.title} ${song.artist} ${song.tags.join(" ")}`.toLowerCase();
          return haystack.includes(query) && (!favoritesOnly || favoriteIds.has(song.id));
        });

        return (
          <>
            <div className="mt-8 flex justify-end">
              <Button type="button" aria-label="Filter songs" variant="secondary" onClick={() => setFiltersOpen((value) => !value)}>
                <SlidersHorizontal className="size-4" />
                Filter
              </Button>
            </div>
            {status && <p className={statusOk ? "mt-4 text-sm font-bold text-emerald-300" : "mt-4 text-sm font-bold text-amber-200"}>{status}</p>}
            {filtersOpen && (
              <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#17161b] p-4">
                <Button type="button" variant={favoritesOnly ? "primary" : "secondary"} onClick={() => setFavoritesOnly((value) => !value)}>
                  Favorites
                </Button>
                <Button type="button" variant="secondary" onClick={() => setFavoritesOnly(false)}>
                  All Songs
                </Button>
              </div>
            )}
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredSongs.map((song) => (
                <Card key={song.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/songs/${song.id}`} className="font-bold text-white hover:text-violet-100">
                        {song.title}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-zinc-300">{song.artist}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${favoriteIds.has(song.id) ? "Remove" : "Add"} ${song.title} favorite`}
                      className="rounded-md p-1 text-violet-200 hover:bg-white/[0.06]"
                      disabled={isPending}
                      onClick={() => toggleFavorite(song)}
                    >
                      <Heart className={favoriteIds.has(song.id) ? "size-5 fill-violet-200 text-violet-200" : "size-5 text-violet-200"} />
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>Key: {song.currentKey}</Badge>
                    <Badge>{song.bpm} BPM</Badge>
                    <Badge>{song.timeSignature}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {song.tags.map((tag) => (
                      <Badge key={tag} className="text-zinc-200">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-6 border-t border-white/10 pt-4 flex items-center gap-4">
                    <Link href={`/songs/${song.id}`} className="text-sm font-bold text-violet-200 hover:text-violet-100">
                      View Chords
                    </Link>
                    <Link href={`/songs/${song.id}/edit`} className="text-sm font-bold text-violet-200 hover:text-violet-100">
                      Edit
                    </Link>
                    {song.youtubeUrl && (
                      <Link href={`/songs/${song.id}`} className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30">
                        <Play className="size-3.5 fill-red-300" />
                        Watch
                      </Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        );
      }}
    </SearchBox>
  );
}
