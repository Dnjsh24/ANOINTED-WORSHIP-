import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ListPagination } from "@/components/list-pagination";
import { SongLibraryGrid } from "@/components/song-library-grid";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/domain/rbac";
import { songs as sampleSongs } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSongs } from "@/lib/desktop/workspace";
import type { Song } from "@/lib/types";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { getListingPage, getListingPageCount, parsePageNumber, sanitizeListingSearch } from "@/lib/domain/listing-pagination";

type SongListRow = {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  bpm: number | null;
  time_signature: string | null;
  tags: string[] | null;
  youtube_url: string | null;
  image_url?: string | null;
  album?: string | null;
  setlist_songs: unknown;
};
type SearchParams = Promise<{ q?: string; page?: string; sort?: string; favorites?: string }>;
const PAGE_SIZE = 50;

function playCountFromRelation(value: unknown): number {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object" || !("count" in relation)) return 0;
  return typeof relation.count === "number" ? relation.count : 0;
}

function toSong(row: SongListRow, favorite: boolean): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    originalKey: row.original_key,
    currentKey: row.original_key,
    bpm: row.bpm,
    timeSignature: row.time_signature ?? "4/4",
    tags: row.tags || [],
    favorite,
    sections: [],
    youtubeUrl: row.youtube_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    album: row.album ?? undefined,
    playCount: playCountFromRelation(row.setlist_songs),
  };
}

export default async function SongsPage({ searchParams = Promise.resolve({}) }: { searchParams?: SearchParams }) {
  const teamContext = await getRequiredTeamContext();
  const params = await searchParams;
  const searchTerm = sanitizeListingSearch(params.q);
  const favoriteOnly = params.favorites === "true";
  const sortBy = params.sort === "playCount" ? "playCount" : "title";
  const requestedPage = Math.min(parsePageNumber(params.page), 1000);
  let songsList: Song[] = [];
  let totalSongsCount = 0;
  let currentPage = 1;
  let pageCount = 1;
  const pageRange = (page: number) => getListingPage(page, PAGE_SIZE);

  if (isDesktopRuntime() && teamContext.teamId) {
    const allSongs = listDesktopSongs(teamContext.teamId);
    const normalized = searchTerm.toLowerCase();
    const filtered = allSongs.filter((song) =>
      (!normalized || (song.title + " " + song.artist + " " + song.tags.join(" ")).toLowerCase().includes(normalized))
      && (!favoriteOnly || song.favorite),
    );
    const sorted = [...filtered].sort((left, right) => (sortBy === "playCount" ? (right.playCount ?? 0) - (left.playCount ?? 0) : 0) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
    totalSongsCount = sorted.length;
    pageCount = getListingPageCount(totalSongsCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    const range = pageRange(currentPage);
    songsList = sorted.slice(range.from, range.to + 1);
  } else if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();
    let favoriteIds: string[] | null = null;

    const runQuery = async (withOptionalColumns: boolean, page: number) => {
      const columns = withOptionalColumns
        ? "id, title, artist, original_key, bpm, time_signature, tags, youtube_url, image_url, album, setlist_songs(count)"
        : "id, title, artist, original_key, bpm, time_signature, tags, youtube_url, setlist_songs(count)";
      let query = supabase.rpc("search_songs", {
        p_team_id: teamContext.teamId!, p_query: searchTerm, p_favorites: favoriteOnly, p_sort: sortBy,
      }, { count: "exact" }).select(columns);
      if (sortBy === "title") query = query.order("title").order("id", { ascending: true });
      const range = pageRange(page);
      return query.range(range.from, range.to);
    };

    let result = await runQuery(true, requestedPage);
    if (result.error?.message.includes("column")) {
      console.warn("Migration missing on remote DB, retrying the safe song list query:", safeErrorDetails(result.error));
      result = await runQuery(false, requestedPage);
    }
    totalSongsCount = result.count ?? 0;
    pageCount = getListingPageCount(totalSongsCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    if (currentPage !== requestedPage) {
      result = await runQuery(result.data?.some((row) => "image_url" in row || "album" in row) ?? false, currentPage);
    }
    if (result.error) console.warn("Song page query failed:", safeErrorDetails(result.error));
    const rows = (result.data ?? []) as unknown as SongListRow[];
    if (teamContext.memberId && rows.length) {
      const { data, error } = await supabase.from("song_favorites").select("song_id")
        .eq("team_member_id", teamContext.memberId).in("song_id", rows.map(row => row.id));
      if (error) console.warn("Favorite songs could not be loaded:", safeErrorDetails(error));
      favoriteIds = (data ?? []).map(row => row.song_id);
    }
    const favoritesOnPage = new Set(favoriteIds ?? []);
    songsList = ((result.data ?? []) as unknown as SongListRow[]).map((song) => toSong(song, favoritesOnPage.has(song.id)));
    totalSongsCount = result.count ?? totalSongsCount;
  } else {
    const normalized = searchTerm.toLowerCase();
    const filtered = sampleSongs.filter((song) =>
      (!normalized || (song.title + " " + song.artist + " " + song.tags.join(" ")).toLowerCase().includes(normalized))
      && (!favoriteOnly || song.favorite),
    );
    const sorted = [...filtered].sort((left, right) => (sortBy === "playCount" ? (right.playCount ?? 0) - (left.playCount ?? 0) : 0) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
    totalSongsCount = sorted.length;
    pageCount = getListingPageCount(totalSongsCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    const range = pageRange(currentPage);
    songsList = sorted.slice(range.from, range.to + 1);
  }

  return (
    <AppShell active="Song Library" teamContext={teamContext}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Song Library</h1>
          <p className="mt-2 text-sm font-medium text-zinc-300">
            Manage and browse your team&apos;s song catalog. Keep setlists fresh and transpose keys on the fly.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ButtonLink href="/songs/trash" variant="secondary" className="px-3" aria-label="View deleted songs">
            <Trash2 className="size-4" />
          </ButtonLink>
          <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#18171c] px-4 py-2.5 text-sm font-bold">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Matching Songs</span>
            <span className="text-white font-extrabold text-base">{totalSongsCount}</span>
          </div>
          {can(teamContext.role, "songs.create") && (
            <ButtonLink href="/songs/new">
              <Plus className="size-4" />
              Add New Song
            </ButtonLink>
          )}
        </div>
      </div>

      <SongLibraryGrid songs={songsList} searchTerm={searchTerm} favoritesOnly={favoriteOnly} sortBy={sortBy} />
      <ListPagination
        path="/songs"
        page={currentPage}
        pageCount={pageCount}
        totalCount={totalSongsCount}
        params={{ q: searchTerm || undefined, favorites: favoriteOnly ? "true" : undefined, sort: sortBy }}
      />
    </AppShell>
  );
}
