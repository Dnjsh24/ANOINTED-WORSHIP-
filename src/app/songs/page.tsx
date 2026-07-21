import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SongLibraryGrid } from "@/components/song-library-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/domain/rbac";
import { songs as sampleSongs } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Song } from "@/lib/types";

export default async function SongsPage() {
  const teamContext = await getRequiredTeamContext();

  let songsList: Song[] = hasSupabaseEnv() ? [] : sampleSongs;
  let totalSongsCount = hasSupabaseEnv() ? 0 : sampleSongs.length;

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();
    let { data: dbSongs, error } = await supabase
      .from("songs")
      .select("id, title, artist, original_key, bpm, time_signature, tags, youtube_url, image_url, album, setlist_songs(count)")
      .eq("team_id", teamContext.teamId)
      .order("title");

    // Fallback if the remote database hasn't had the migration applied yet
    if (error && error.message.includes("column")) {
      console.warn("Migration missing on remote DB, falling back to safe query:", error);
      const fallback = await supabase
        .from("songs")
        .select("id, title, artist, original_key, bpm, time_signature, tags, youtube_url, setlist_songs(count)")
        .eq("team_id", teamContext.teamId)
        .order("title");
      
      dbSongs = fallback.data as any;
    }

    if (dbSongs) {
      songsList = dbSongs.map((s) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        originalKey: s.original_key,
        currentKey: s.original_key,
        bpm: s.bpm,
        timeSignature: s.time_signature,
        tags: s.tags || [],
        favorite: false,
        sections: [],
        youtubeUrl: s.youtube_url ?? undefined,
        imageUrl: s.image_url ?? undefined,
        album: s.album ?? undefined,
        playCount: Array.isArray(s.setlist_songs) ? (s.setlist_songs[0]?.count ?? 0) : ((s.setlist_songs as any)?.count ?? 0),
      }));
      totalSongsCount = dbSongs.length;
    }
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
          <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#18171c] px-4 py-2.5 text-sm font-bold">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Total Songs</span>
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

      <div className="mt-8">
        <SongLibraryGrid songs={songsList} />
      </div>
    </AppShell>
  );
}
