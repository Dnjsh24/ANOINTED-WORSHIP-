import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SongForm } from "@/components/song-form";
import { Panel } from "@/components/ui/card";
import { can } from "@/lib/domain/rbac";
import { songs as sampleSongs } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import type { Song } from "@/lib/types";

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (!can(teamContext.role, "songs.edit")) {
    redirect(`/songs/${id}`);
  }

  let song: Song | null = hasSupabaseEnv() ? null : sampleSongs.find((item) => item.id === id) ?? sampleSongs[0];

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: dbSong } = await supabase
      .from("songs")
      .select("*")
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (dbSong) {
      song = {
        id: dbSong.id,
        title: dbSong.title,
        artist: dbSong.artist,
        originalKey: dbSong.original_key,
        currentKey: dbSong.original_key,
        bpm: dbSong.bpm,
        timeSignature: dbSong.time_signature,
        tags: dbSong.tags || [],
        favorite: false,
        sections: parseLyricsAndChords(dbSong.lyrics_chords),
      };
    }
  }

  if (!song) {
    notFound();
  }

  return (
    <AppShell active="Song Library" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Song Library</p>
        <h1 className="mt-2 text-4xl font-bold">Edit Song</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">{song.title}</p>
      </div>
      <Panel>
        <SongForm song={song} />
      </Panel>
    </AppShell>
  );
}
