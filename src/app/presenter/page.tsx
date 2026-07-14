import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import PresenterClient from "./presenter-client";

export default async function GlobalPresenterPage() {
  const teamContext = await getRequiredTeamContext();

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch all upcoming setlists for the team
    const { data: dbSetlists } = await supabase
      .from("setlists")
      .select(`
        *,
        events (
          type
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          notes,
          arrangement,
          song:songs (
            id,
            title,
            bpm,
            original_key,
            lyrics_chords
          )
        )
      `)
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false })
      .limit(10); // Fetching the 10 most recent/upcoming setlists for the dropdown

    if (dbSetlists) {
      const setlists = dbSetlists.map((dbSetlist: any) => {
        const dbSetlistSongs = dbSetlist.setlist_songs || [];
        dbSetlistSongs.sort((a: any, b: any) => (a.song_order ?? 0) - (b.song_order ?? 0));

        const songsList = dbSetlistSongs.map((ss: any) => ({
          id: ss.id,
          order: ss.song_order,
          assignedKey: ss.assigned_key,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
            originalKey: ss.song?.original_key || "C",
            lyricsChords: ss.song?.lyrics_chords || "",
          },
        }));

        return {
          id: dbSetlist.id,
          name: dbSetlist.name,
          date: dbSetlist.setlist_date,
          type: dbSetlist.events?.type || "sunday_service",
          songs: songsList,
          presentationSettings: dbSetlist.presentation_settings,
        };
      });

      return <PresenterClient setlists={setlists} />;
    }
  }

  notFound();
}
