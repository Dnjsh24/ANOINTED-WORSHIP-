import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import StageModeClient from "./stage-mode-client";
import type { Viewport } from "next";
import type { Database } from "@/lib/supabase/database.types";

type StageSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "assigned_key" | "song_order" | "notes" | "arrangement"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    "id" | "title" | "bpm" | "original_key" | "lyrics_chords" | "youtube_url"
  > | null;
};

type StageSetlistRow = Database["public"]["Tables"]["setlists"]["Row"] & {
  events: Pick<Database["public"]["Tables"]["events"]["Row"], "type"> | null;
  setlist_songs: StageSetlistSongRow[];
};

export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
};

export default async function SetlistStagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data } = await supabase
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
            lyrics_chords,
            youtube_url
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbSetlist = data as unknown as StageSetlistRow | null;

    if (dbSetlist) {
      const dbSetlistSongs = dbSetlist.setlist_songs || [];

      // Sort by song_order
      dbSetlistSongs.sort((a, b) => (a.song_order ?? 0) - (b.song_order ?? 0));

      const songsList = dbSetlistSongs.map((ss) => {
        let leadVocal = "";
        if (ss.notes && ss.notes.startsWith("Lead: ")) {
          leadVocal = ss.notes.replace("Lead: ", "");
        }
        return {
          id: ss.id,
          order: ss.song_order,
          assignedKey: ss.assigned_key,
          lead: leadVocal,
          youtubeUrl: ss.song?.youtube_url || null,
          arrangement: ss.arrangement || null,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
            originalKey: ss.song?.original_key || "C",
            lyricsChords: ss.song?.lyrics_chords || "",
          },
        };
      });

      const setlist = {
        id: dbSetlist.id,
        date: dbSetlist.setlist_date,
        type: dbSetlist.events?.type || "sunday_service",
        songs: songsList,
      };

      return <StageModeClient setlist={setlist} />;
    }
  }

  notFound();
}
