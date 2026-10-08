import { notFound } from "next/navigation";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext, type ActiveTeamContext } from "@/lib/supabase/team-guard";
import type { Database } from "@/lib/supabase/database.types";
import type { Song } from "@/lib/types";
import PracticeModeClient from "./practice-mode-client";
import type { PracticeSetlist, PracticeSetlistSong } from "./practice-mode.types";
import { loadPreparationWorkspace, type PreparationWorkspace, type WorkspaceResult } from "@/lib/supabase/workflow-data";
import { canForTeam } from "@/lib/domain/permission-overrides";
import { canEditSongDirectly } from "@/lib/domain/shared-edit-requests";
import { parseSongSlotNotes } from "@/lib/domain/song-slot-notes";
import { requestRehearsalPlanAction } from "@/app/workflow-proposals";

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
    | "sync_revision"
    | "created_by"
  > | null;
};

type PracticeSetlistRow = Pick<
  Database["public"]["Tables"]["setlists"]["Row"],
  "id" | "name" | "setlist_date" | "event_id"
> & {
  setlist_songs: PracticeSetlistSongRow[];
};

function mapDatabaseSong(row: PracticeSetlistSongRow, teamContext: ActiveTeamContext): PracticeSetlistSong | null {
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
  const slotNotes = parseSongSlotNotes(row.notes);
  const songIsProposal = !canEditSongDirectly(teamContext.role, teamContext.userId, row.song.created_by, teamContext.permissionOverrides);

  return {
    slotId: row.id,
    assignedKey: row.assigned_key,
    lead: slotNotes.lead,
    arrangement: row.arrangement,
    notes: slotNotes.notes,
    bandNotes: row.band_notes,
    songRevision: row.song.sync_revision,
    songIsProposal,
    songEditAllowed: !songIsProposal || canForTeam(teamContext, "songs.edit"),
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
  let preparation: WorkspaceResult<PreparationWorkspace> | undefined;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("setlists")
      .select(`
        id,
        name,
        setlist_date,
        event_id,
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
            album,
            sync_revision,
            created_by
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
        eventId: databaseSetlist.event_id,
        songs: [...databaseSetlist.setlist_songs]
          .sort((first, second) => (first.song_order ?? 0) - (second.song_order ?? 0))
          .flatMap((song) => {
            const mappedSong = mapDatabaseSong(song, teamContext);
            return mappedSong ? [mappedSong] : [];
          }),
      };
      preparation = await loadPreparationWorkspace(supabase, teamContext.teamId, setlist.id, setlist.eventId ?? null, setlist.songs.map(song => song.slotId));
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

  return <PracticeModeClient key={setlist.id} setlist={setlist} preparation={preparation} memberId={teamContext.memberId} canManage={canForTeam(teamContext, "setlists.manage")} proposeAction={requestRehearsalPlanAction.bind(null, setlist.id)} />;
}
