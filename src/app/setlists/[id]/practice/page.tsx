import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { can } from "@/lib/domain/rbac";
import { parseArrangementSections } from "@/lib/domain/arrangements";
import type { PracticeSetlistSong } from "@/lib/domain/practice";
import type { Database } from "@/lib/supabase/database.types";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import PracticeModeClient from "./practice-mode-client";

type PracticeSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "assigned_key" | "song_order" | "notes" | "arrangement" | "arrangement_sections"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    "id" | "title" | "bpm" | "original_key" | "lyrics_chords" | "youtube_url" | "spotify_url" | "time_signature"
  > | null;
};

type PracticeSetlistRow = Database["public"]["Tables"]["setlists"]["Row"] & {
  setlist_songs: PracticeSetlistSongRow[];
};

export default async function SetlistPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canEditSong = can(
    teamContext.role,
    "songs.edit",
    teamContext.customPermissions,
    teamContext.rolePermissions,
  );

  let setlistName = "Setlist Practice";
  let songsList: PracticeSetlistSong[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data } = await supabase
      .from("setlists")
      .select(`
        id,
        name,
        setlist_date,
        setlist_songs (
          id,
          assigned_key,
          song_order,
          notes,
          arrangement,
          arrangement_sections,
          song:songs (
            id,
            title,
            bpm,
            original_key,
            lyrics_chords,
            youtube_url,
            spotify_url,
            time_signature
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    const dbSetlist = data as unknown as PracticeSetlistRow | null;

    if (dbSetlist) {
      setlistName = dbSetlist.name || "Setlist Practice";
      const dbSongs = [...(dbSetlist.setlist_songs || [])];
      dbSongs.sort((a, b) => (a.song_order ?? 0) - (b.song_order ?? 0));

      songsList = dbSongs.map((ss) => {
        let leadVocal = "";
        if (ss.notes && ss.notes.startsWith("Lead: ")) {
          leadVocal = ss.notes.replace("Lead: ", "");
        }
        return {
          slotId: ss.id,
          songId: ss.song?.id || `song-${ss.id}`,
          order: ss.song_order ?? 1,
          title: ss.song?.title || "Untitled Song",
          lead: leadVocal,
          assignedKey: ss.assigned_key || ss.song?.original_key || "C",
          originalKey: ss.song?.original_key || "C",
          arrangement: ss.arrangement || null,
          arrangementSections: parseArrangementSections(ss.arrangement_sections),
          lyricsChords: ss.song?.lyrics_chords || "",
          bpm: ss.song?.bpm || null,
          timeSignature: ss.song?.time_signature || "4/4",
          youtubeUrl: ss.song?.youtube_url || null,
          spotifyUrl: ss.song?.spotify_url || null,
        };
      });

      return (
        <PracticeModeClient
          setlistId={dbSetlist.id}
          setlistName={setlistName}
          songs={songsList}
          canEditSong={canEditSong}
          teamContext={teamContext}
        />
      );
    }
  }

  // Sample data fallback for local dev/testing without env
  const sample = sampleSetlists.find((s: (typeof sampleSetlists)[number]) => s.id === id) ?? sampleSetlists[0];
  if (sample) {
    songsList = sample.songs.map((ss: (typeof sample.songs)[number], idx: number) => ({
      slotId: ss.id,
      songId: ss.song.id,
      order: ss.order ?? idx + 1,
      title: ss.song.title,
      lead: ss.lead,
      assignedKey: ss.assignedKey || ss.song.originalKey || "C",
      originalKey: ss.song.originalKey || "C",
      arrangement: ss.arrangement ?? null,
      arrangementSections: [],
      lyricsChords: ss.song.rawLyricsChords || "",
      bpm: ss.song.bpm,
      timeSignature: ss.song.timeSignature || "4/4",
      youtubeUrl: ss.song.youtubeUrl ?? null,
      spotifyUrl: ss.song.spotifyUrl ?? null,
    }));

    return (
      <PracticeModeClient
        setlistId={sample.id}
        setlistName={sample.name}
        songs={songsList}
        canEditSong={canEditSong}
        teamContext={teamContext}
      />
    );
  }

  notFound();
}
