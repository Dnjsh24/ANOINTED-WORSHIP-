"use client";

import { Heart, Play, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSongFavoriteAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Song } from "@/lib/types";

export function SongLibraryGrid({
  songs,
  searchTerm,
  favoritesOnly,
  sortBy,
}: {
  songs: Song[];
  searchTerm: string;
  favoritesOnly: boolean;
  sortBy: "title" | "playCount";
}) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const serverFavorites = new Set(songs.filter((song) => song.favorite).map((song) => song.id));
  const favoriteSnapshot = songs.map((song) => song.id + ":" + Number(song.favorite)).join("|");
  const [favoriteState, setFavoriteState] = useState(() => ({ snapshot: favoriteSnapshot, ids: serverFavorites }));
  const favoriteIds = favoriteState.snapshot === favoriteSnapshot ? favoriteState.ids : serverFavorites;
  const [status, setStatus] = useState("");
  const [statusOk, setStatusOk] = useState(true);
  const [isPending, startTransition] = useTransition();

  function toggleFavorite(song: Song) {
    const nextFavorite = !favoriteIds.has(song.id);
    const formData = new FormData();
    formData.set("songId", song.id);
    formData.set("favorite", String(nextFavorite));

    startTransition(() => {
      void (async () => {
        const result = await toggleSongFavoriteAction(formData);
        setStatus(result.message);
        setStatusOk(result.ok);
        if (!result.ok) return;
        setFavoriteState((current) => {
          const next = new Set(favoriteState.snapshot === favoriteSnapshot ? current.ids : serverFavorites);
          if (nextFavorite) next.add(song.id);
          else next.delete(song.id);
          return { snapshot: favoriteSnapshot, ids: next };
        });
        router.refresh();
      })();
    });
  }

  return (
    <>
      <form action="/songs" method="get" className="mt-6 sm:mt-8">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <button type="submit" aria-label="Search songs" className="absolute inset-y-0 left-0 flex w-10 items-center justify-center rounded-l-md text-zinc-500 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
              <Search aria-hidden="true" className="size-4" />
            </button>
            <Input data-wooly-target="song-search" aria-label="Search by title, artist, or tag" name="q" defaultValue={searchTerm} maxLength={100} placeholder="Search songs..." className="pl-10 text-xs sm:text-sm" />
          </div>
          <Button data-wooly-target="song-filters" type="button" aria-label="Toggle song filters" aria-expanded={filtersOpen} aria-controls="song-filter-options" variant="secondary" className="h-10 shrink-0 px-3 text-xs sm:px-4 sm:text-sm" onClick={() => setFiltersOpen((value) => !value)}>
            <SlidersHorizontal aria-hidden="true" className="size-4 text-violet-300" />
            Filters
          </Button>
        </div>
        <div id="song-filter-options" hidden={!filtersOpen} className="mt-4 flex flex-wrap items-end gap-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-4">
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-zinc-400">Sort results</span>
            <select name="sort" defaultValue={sortBy} className="h-10 rounded-md border border-white/10 bg-[#111014] px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
              <option value="title">Title A–Z</option>
              <option value="playCount">Most played</option>
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-zinc-300">
            <input type="checkbox" name="favorites" value="true" defaultChecked={favoritesOnly} className="size-4 accent-violet-500" />
            Favorites only
          </label>
          <Button type="submit" className="h-10">Apply filters</Button>
        </div>
      </form>
      {status && <p role="status" className={statusOk ? "mt-4 text-sm font-bold text-emerald-300" : "mt-4 text-sm font-bold text-amber-200"}>{status}</p>}
      {songs.length ? (
        <div data-wooly-target="song-list" className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {songs.map((song) => (
            <Card key={song.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-1 items-start gap-4">
                  {song.imageUrl ? (
                    <Image unoptimized width={56} height={56} src={song.imageUrl} alt="" className="size-14 shrink-0 rounded-md object-cover shadow-sm" />
                  ) : (
                    <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-md bg-white/10">
                      <Heart className="size-5 text-zinc-500 opacity-50" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <Link href={"/songs/" + song.id} className="font-bold text-white hover:text-violet-100">{song.title}</Link>
                    <p className="mt-1 text-sm font-semibold text-zinc-300">{song.artist}</p>
                    {song.album && <p className="mt-0.5 text-xs font-semibold italic text-zinc-400">Album: {song.album}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={(favoriteIds.has(song.id) ? "Remove " : "Add ") + song.title + " favorite"}
                  className="rounded-md p-1 text-violet-200 hover:bg-white/[0.06]"
                  disabled={isPending}
                  onClick={() => toggleFavorite(song)}
                >
                  <Heart className={favoriteIds.has(song.id) ? "size-5 fill-violet-200 text-violet-200" : "size-5 text-violet-200"} />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge>Key: {song.currentKey}</Badge>
                <Badge>{song.bpm ?? "—"} BPM</Badge>
                <Badge>{song.timeSignature}</Badge>
                {(song.playCount ?? 0) > 0 && <Badge className="border-violet-500/30 bg-violet-500/20 text-violet-300">Played {song.playCount} {song.playCount === 1 ? "time" : "times"}</Badge>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {song.tags.map((tag) => <Badge key={tag} className="text-zinc-200">{tag}</Badge>)}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
                <Link href={"/songs/" + song.id} className="text-sm font-bold text-violet-200 hover:text-violet-100">View Chords</Link>
                <Link href={"/songs/" + song.id + "/edit"} className="text-sm font-bold text-violet-200 hover:text-violet-100">Edit</Link>
                {song.youtubeUrl && (
                  <Link href={"/songs/" + song.id} className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30">
                    <Play className="size-3.5 fill-red-300" /> Watch
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p role="status" className="mt-8 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm font-semibold text-zinc-400">
          No songs match these search and filter settings.
        </p>
      )}
    </>
  );
}
