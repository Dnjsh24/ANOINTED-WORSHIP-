import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import ConfidenceClient from "./confidence-client";

export default async function ConfidenceMonitorPage({ params }: { params: Promise<{ id: string }> }) {
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
          song_order,
          song:songs (
            id,
            title,
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
      
      const formattedSetlist = {
        ...dbSetlist,
        presentationSettings: dbSetlist.presentation_settings || {},
        songs: dbSetlistSongs,
      };

      return <ConfidenceClient setlist={formattedSetlist} />;
    }
  }

  notFound();
}
