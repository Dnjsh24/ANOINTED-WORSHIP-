import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SongTrashList, type TrashedSong } from "@/components/song-trash-list";
import { ButtonLink } from "@/components/ui/button";
import { can } from "@/lib/domain/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function SongsTrashPage() {
  const teamContext = await getRequiredTeamContext();
  
  if (!can(teamContext.role, "songs.delete")) {
    notFound();
  }

  let trashedSongs: TrashedSong[] = [];

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();
    const { data: dbSongs, error } = await supabase
      .from("songs")
      .select("id, title, artist, original_key, bpm, time_signature, tags, youtube_url, image_url, album, deleted_at")
      .not("deleted_at", "is", null)
      .eq("team_id", teamContext.teamId)
      .order("deleted_at", { ascending: false });

    // Fallback if the remote database hasn't had the migration applied yet
    if (error && error.message.includes("column")) {
      console.warn("Migration missing on remote DB, falling back to safe query:", error);
    } else if (dbSongs) {
      trashedSongs = dbSongs.map((s) => ({
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
        playCount: 0,
        deletedAt: s.deleted_at as string,
      }));
    }
  }

  return (
    <AppShell active="Song Library" teamContext={teamContext}>
      <div className="mb-6 animate-fade-up">
        <ButtonLink href="/songs" variant="secondary" className="mb-6 inline-flex rounded-xl px-4 py-2 text-xs">
          <ArrowLeft className="mr-1.5 size-3.5" />
          Back to Library
        </ButtonLink>
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Song Library</p>
        <h1 className="mt-2 text-4xl font-bold">Trash</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">
          Songs in the trash will be permanently deleted after 30 days.
        </p>
      </div>

      <div className="mt-8 animate-fade-up">
        <SongTrashList songs={trashedSongs} />
      </div>
    </AppShell>
  );
}
