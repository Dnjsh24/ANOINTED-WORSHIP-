import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Database } from "@/lib/supabase/database.types";
import type { Song } from "@/lib/types";
import PracticeModeClient from "./practice-mode-client";
import type { PracticeSetlist, PracticeSetlistSong } from "./practice-mode.types";

type PracticeSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "assigned_key" | "song_order" | "notes" | "arrangement" | "band_notes"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    | "id"
    | "title"
    | "artist"
    | "bpm"
    | "original_key"
    | "time_signature"
    | "tags"
    | "lyrics_chords"
    | "youtube_url"
    | "spotify_url"
    | "image_url"
    | "album"
  > | null;
};

type PracticeSetlistRow = Pick<
  Database["public"]["Tables"]["setlists"]["Row"],
  "id" | "name" | "setlist_date"
> & {
  setlist_songs: PracticeSetlistSongRow[];
};

function getLead(notes: string | null): string | null {
  const leadPrefix = "Lead: ";
  return notes?.startsWith(leadPrefix) ? notes.slice(leadPrefix.length).trim() || null : null;
}

function getPracticeNotes(notes: string | null): string | null {
  if (!notes || notes.startsWith("Lead: ") || notes.startsWith("Template Tag: ")) return null;
  return notes;
}

function mapDatabaseSong(row: PracticeSetlistSongRow): PracticeSetlistSong | null {
  if (!row.song) return null;

  const song: Song = {
    id: row.song.id,
    title: row.song.title,
    artist: row.song.artist,
    originalKey: row.song.original_key,
    currentKey: row.song.original_key,
    bpm: row.song.bpm,
    timeSignature: row.song.time_signature ?? "4/4",
    tags: row.song.tags ?? [],
    favorite: false,
    sections: parseLyricsAndChords(row.song.lyrics_chords ?? ""),
    youtubeUrl: row.song.youtube_url ?? undefined,
    spotifyUrl: row.song.spotify_url ?? undefined,
    imageUrl: row.song.image_url ?? undefined,
    album: row.song.album ?? undefined,
  };

  return {
    slotId: row.id,
    assignedKey: row.assigned_key,
    lead: getLead(row.notes),
    arrangement: row.arrangement,
    notes: getPracticeNotes(row.notes),
    bandNotes: row.band_notes,
    song,
  };
}

function mapSampleSong(song: (typeof sampleSetlists)[number]["songs"][number]): PracticeSetlistSong {
  return {
    slotId: song.id,
    assignedKey: song.assignedKey,
    lead: song.lead ?? null,
    arrangement: song.arrangement ?? null,
    notes: null,
    bandNotes: song.bandNotes ?? null,
    song: song.song,
  };
}

export default async function PracticeSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  let setlist: PracticeSetlist | null = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data, error } = await supabase
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
          band_notes,
          song:songs (
            id,
            title,
            artist,
            bpm,
            original_key,
            time_signature,
            tags,
            lyrics_chords,
            youtube_url,
            spotify_url,
            image_url,
            album
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    if (error) throw new Error("Unable to load this practice setlist.");
    const databaseSetlist = data as unknown as PracticeSetlistRow | null;

    if (databaseSetlist) {
      setlist = {
        id: databaseSetlist.id,
        name: databaseSetlist.name,
        date: databaseSetlist.setlist_date,
        songs: [...databaseSetlist.setlist_songs]
          .sort((first, second) => (first.song_order ?? 0) - (second.song_order ?? 0))
          .flatMap((song) => {
            const mappedSong = mapDatabaseSong(song);
            return mappedSong ? [mappedSong] : [];
          }),
      };
    }
  } else {
    const sample = sampleSetlists.find((item) => item.id === id);
    if (sample) {
      setlist = {
        id: sample.id,
        name: sample.name,
        date: sample.date,
        songs: sample.songs.map(mapSampleSong),
      };
    }
  }

  if (!setlist) notFound();

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <PracticeModeClient key={setlist.id} setlist={setlist} />
    </AppShell>
  );
}
