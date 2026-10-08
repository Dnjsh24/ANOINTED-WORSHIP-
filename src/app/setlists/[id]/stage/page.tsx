import { parseSongSlotNotes } from "@/lib/domain/song-slot-notes";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import StageModeClient from "./stage-mode-client";
import type { Viewport } from "next";
import type { Database } from "@/lib/supabase/database.types";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { formatSongToText } from "@/lib/domain/chords";

type StageSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "assigned_key" | "song_order" | "notes" | "arrangement"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    "id" | "title" | "bpm" | "original_key" | "time_signature" | "lyrics_chords" | "youtube_url"
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

  if (!hasSupabaseEnv()) {
    const sample = sampleSetlists.find(setlist => setlist.id === id);
    if (!sample) notFound();
    return <StageModeClient setlist={{
      id: sample.id,
      date: sample.date,
      type: sample.eventType ?? "service",
      songs: [...sample.songs].sort((a, b) => a.order - b.order).map(slot => ({
        id: slot.id,
        order: slot.order,
        assignedKey: slot.assignedKey,
        lead: slot.lead ?? "",
        youtubeUrl: slot.song.youtubeUrl ?? null,
        arrangement: slot.arrangement ?? null,
        song: { id: slot.song.id, title: slot.song.title, bpm: slot.song.bpm ?? 70, originalKey: slot.song.originalKey, timeSignature: slot.song.timeSignature ?? "4/4", lyricsChords: formatSongToText(slot.song) },
      })),
    }} />;
  }

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data, error } = await supabase
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
            time_signature,
            lyrics_chords,
            youtube_url
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    if (error) throw new Error("Stage mode could not load. Please retry.");
    const dbSetlist = data as unknown as StageSetlistRow | null;

    if (dbSetlist) {
      const dbSetlistSongs = dbSetlist.setlist_songs || [];

      // Sort by song_order
      dbSetlistSongs.sort((a, b) => (a.song_order ?? 0) - (b.song_order ?? 0));

      const songsList = dbSetlistSongs.map((ss) => {
        let leadVocal = "";
        leadVocal = parseSongSlotNotes(ss.notes).lead;
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
            timeSignature: ss.song?.time_signature ?? "4/4",
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
