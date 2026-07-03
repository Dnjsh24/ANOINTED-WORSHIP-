import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SongViewer } from "@/components/song-viewer";
import { AppShell } from "@/components/app-shell";
import { songs as sampleSongs } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import type { Song } from "@/lib/types";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  let song: Song | null = hasSupabaseEnv() ? null : sampleSongs.find((item) => item.id === id) ?? sampleSongs[0];

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: dbSong } = (await supabase
      .from("songs")
      .select("*")
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

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
        youtubeUrl: dbSong.youtube_url ?? undefined,
      };
    }
  }

  if (!song) {
    notFound();
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="animate-fade-up text-left">
        <Link href="/songs" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-white transition mb-6">
          <ArrowLeft className="size-3.5" />
          Back to Songs
        </Link>
        <SongViewer song={song} />
      </div>
    </AppShell>
  );
}
