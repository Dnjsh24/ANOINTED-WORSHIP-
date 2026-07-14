import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import RemoteClient from "./remote-client";

export default async function SetlistRemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data: dbSetlist } = (await supabase
      .from("setlists")
      .select(`
        *,
        setlist_songs (
          id,
          assigned_key,
          song_order,
          song:songs (
            title,
            bpm,
            original_key,
            lyrics_chords
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

    if (dbSetlist) {
      const dbSetlistSongs = dbSetlist.setlist_songs || [];
      dbSetlistSongs.sort((a: any, b: any) => (a.song_order ?? 0) - (b.song_order ?? 0));

      const songsList = dbSetlistSongs.map((ss: any) => ({
        id: ss.id,
        song: {
          title: ss.song?.title || "Unknown Song",
          lyricsChords: ss.song?.lyrics_chords || "",
        },
      }));

      const setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        songs: songsList,
        presentationSettings: dbSetlist.presentation_settings,
      };

      return <RemoteClient setlist={setlist} />;
    }
  }

  notFound();
}
