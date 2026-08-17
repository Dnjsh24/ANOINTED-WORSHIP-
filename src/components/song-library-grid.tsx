"use client";

import { Heart, Play, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
  const [sortBy, setSortBy] = useState<"title" | "playCount">("title");

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

        const sortedSongs = [...filteredSongs].sort((a, b) => {
          if (sortBy === "playCount") {
            return (b.playCount || 0) - (a.playCount || 0);
          }
          return a.title.localeCompare(b.title);
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
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#17161b] p-4">
                <Button type="button" variant={favoritesOnly ? "primary" : "secondary"} onClick={() => setFavoritesOnly((value) => !value)}>
                  Favorites
                </Button>
                <Button type="button" variant={!favoritesOnly ? "primary" : "secondary"} onClick={() => setFavoritesOnly(false)}>
                  All Songs
                </Button>
                <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
                  <span className="text-sm font-semibold text-zinc-400 mr-1">Sort by:</span>
                  <Button type="button" variant={sortBy === "title" ? "primary" : "secondary"} onClick={() => setSortBy("title")}>
                    A-Z
                  </Button>
                  <Button type="button" variant={sortBy === "playCount" ? "primary" : "secondary"} onClick={() => setSortBy("playCount")}>
                    Most Played
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-5 sm:mt-8 grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedSongs.map((song) => (
                <Card key={song.id} className="p-3.5 sm:p-4.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-start gap-2.5 sm:gap-3.5 flex-1 min-w-0">
                        {song.imageUrl ? (
                          <Image unoptimized width={48} height={48} src={song.imageUrl} alt={song.title} className="size-10 sm:size-12 rounded-xl object-cover shadow-sm shrink-0 aspect-square" />
                        ) : (
                          <div className="size-10 sm:size-12 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0 aspect-square">
                            <Play className="size-4 text-violet-300 fill-violet-300 ml-0.5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Link href={`/songs/${song.id}`} className="font-bold text-sm sm:text-base text-white hover:text-violet-300 transition block truncate">
                            {song.title}
                          </Link>
                          <p className="mt-0.5 text-xs font-semibold text-zinc-300 truncate">{song.artist}</p>
                          {song.album && (
                            <p className="mt-0.5 text-[11px] font-medium text-zinc-400 italic truncate">
                              Album: {song.album}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`${favoriteIds.has(song.id) ? "Remove" : "Add"} ${song.title} favorite`}
                        className="rounded-md p-1 text-violet-200 hover:bg-white/[0.06] shrink-0"
                        disabled={isPending}
                        onClick={() => toggleFavorite(song)}
                      >
                        <Heart className={favoriteIds.has(song.id) ? "size-4.5 fill-violet-400 text-violet-400" : "size-4.5 text-zinc-400 hover:text-white"} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge className="px-2 py-0.5 text-[10px]">Key: {song.currentKey}</Badge>
                      <Badge className="px-2 py-0.5 text-[10px]">{song.bpm} BPM</Badge>
                      <Badge className="px-2 py-0.5 text-[10px]">{song.timeSignature}</Badge>
                      {(song.playCount ?? 0) > 0 && (
                        <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 px-2 py-0.5 text-[10px]">
                          Played {song.playCount} {song.playCount === 1 ? "time" : "times"}
                        </Badge>
                      )}
                    </div>
                    {song.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {song.tags.map((tag) => (
                          <Badge key={tag} className="text-zinc-300 bg-white/[0.03] text-[9px] px-1.5 py-0.5">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-3.5 border-t border-white/[0.06] pt-3 flex items-center gap-3">
                    <Link href={`/songs/${song.id}`} className="text-xs font-bold text-violet-300 hover:text-white transition">
                      View Chords
                    </Link>
                    <Link href={`/songs/${song.id}/edit`} className="text-xs font-bold text-zinc-400 hover:text-zinc-200 transition">
                      Edit
                    </Link>
                    {song.youtubeUrl && (
                      <Link href={`/songs/${song.id}`} className="ml-auto flex items-center gap-1 rounded-md bg-red-600/15 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-600/25 transition">
                        <Play className="size-3 fill-red-300" />
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
