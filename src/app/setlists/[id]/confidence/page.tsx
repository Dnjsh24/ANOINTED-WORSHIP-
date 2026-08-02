import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getDesktopPresenterLiveState, getDesktopSetlist } from "@/lib/desktop/workspace";
import ConfidenceClient, { type ConfidenceSetlist } from "./confidence-client";
import type { Database } from "@/lib/supabase/database.types";

type ConfidenceSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "song_order" | "notes"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    "id" | "title" | "lyrics_chords"
  > | null;
};

type ConfidenceSetlistRow = Pick<Database["public"]["Tables"]["setlists"]["Row"], "id"> & {
  setlist_songs: ConfidenceSetlistSongRow[];
};

export default async function ConfidenceMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (isDesktopRuntime() && teamContext.teamId) {
    const setlist = getDesktopSetlist(teamContext.teamId, id);
    if (setlist) {
      return <ConfidenceClient initialLiveState={getDesktopPresenterLiveState(id)} setlist={{
        id: setlist.id,
        songs: setlist.songs.map((item) => ({
          id: item.id,
          notes: item.bandNotes || item.lead || "",
          song: { id: item.song.id, title: item.song.title, lyricsChords: item.song.rawLyricsChords || "" },
        })),
      }} />;
    }
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data } = await supabase
      .from("setlists")
      .select(`
        *,
        setlist_songs (
          id,
          song_order,
          notes,
          song:songs (
            id,
            title,
            lyrics_chords
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbSetlist = data as unknown as ConfidenceSetlistRow | null;

    if (dbSetlist) {
      const dbSetlistSongs = dbSetlist.setlist_songs || [];
      dbSetlistSongs.sort((a, b) => (a.song_order ?? 0) - (b.song_order ?? 0));
      
      const formattedSetlist: ConfidenceSetlist = {
        id: dbSetlist.id,
        songs: dbSetlistSongs.flatMap((setlistSong) => setlistSong.song
          ? [{
              id: setlistSong.id,
              notes: setlistSong.notes || "",
              song: {
                id: setlistSong.song.id,
                title: setlistSong.song.title,
                lyricsChords: setlistSong.song.lyrics_chords || "",
              },
            }]
          : []),
      };

      return <ConfidenceClient setlist={formattedSetlist} />;
    }
  }

  notFound();
}
