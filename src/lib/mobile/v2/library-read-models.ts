import { getSetlistTypeLabel } from "@/lib/domain/event-types";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import { parseSongSlotNotes } from "@/lib/domain/song-slot-notes";
import type { Json } from "@/lib/supabase/database.types";
import type { EventType, Setlist, SetlistChangeLog, SetlistSong, Song } from "@/lib/types";

const EVENT_TYPES = ["service", "rehearsal", "meeting", "special_event", "service_rehearsal"] as const;
const CHANGE_TYPES = ["created", "updated", "song_added", "song_removed", "song_reordered"] as const;
const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);
const CHANGE_TYPE_SET: ReadonlySet<string> = new Set(CHANGE_TYPES);

export type MobileSongReadModel = Song & {
  lyricsChords: string;
};

export type MobileSetlistSlotSong = Song & { lyricsChords: string };

export type MobileSetlistSlotReadModel = Omit<SetlistSong, 'song'> & {
  song: MobileSetlistSlotSong;
  lead: string;
  leadMemberId: string | null;
  youtubeUrl: string | null;
  notes: string | null;
  slideSettings: Json | null;
  createdAt: string;
};

export type MobileSetlistHistoryEntry = SetlistChangeLog & { snapshot: Json };

export type MobileSetlistReadModel = Omit<Setlist, "songs" | "eventId"> & {
  songs: MobileSetlistSlotReadModel[];
  eventLabel: string;
  eventId?: string;
  eventType?: EventType;
  leaderMemberId: string | null;
  createdBy: string;
  presentationSettings: Json | null;
  history: MobileSetlistHistoryEntry[];
};

export class LibraryReadModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryReadModelError";
  }
}

export function getSongReadModel(row: unknown, favorite: boolean): MobileSongReadModel {
  const record = requireRecord(row, "song");
  const lyricsChords = requireString(record.lyrics_chords, "song.lyrics_chords");
  const originalKey = requireString(record.original_key, "song.original_key");
  const spotifyUrl = optionalString(record.spotify_url, "song.spotify_url");
  const youtubeUrl = optionalString(record.youtube_url, "song.youtube_url");
  const imageUrl = optionalString(record.image_url, "song.image_url");
  const album = optionalString(record.album, "song.album");

  return {
    id: requireString(record.id, "song.id"),
    title: requireString(record.title, "song.title"),
    artist: requireString(record.artist, "song.artist"),
    originalKey,
    currentKey: originalKey,
    bpm: optionalNumber(record.bpm, "song.bpm"),
    timeSignature: nullableString(record.time_signature, "song.time_signature") ?? "4/4",
    tags: nullableStringArray(record.tags, "song.tags") ?? [],
    favorite,
    sections: parseLyricsAndChords(lyricsChords),
    lyricsChords,
    ...(youtubeUrl ? { youtubeUrl } : {}),
    ...(spotifyUrl ? { spotifyUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(album ? { album } : {}),
    playCount: getPlayCount(record.setlist_songs),
  };
}

export function getSetlistReadModel(
  row: unknown,
  slotRows: readonly unknown[],
  historyRows: readonly unknown[],
  changerNames: ReadonlyMap<string, string>,
  songsById: ReadonlyMap<string, MobileSongReadModel>,
): MobileSetlistReadModel {
  const record = requireRecord(row, "setlist");
  const eventType = getEventType(record.events);
  const serviceTimes = nullableStringArray(record.service_times, "setlist.service_times") ?? ["Sunday Worship"];
  const history: MobileSetlistHistoryEntry[] = historyRows
    .map((historyRow) => getSetlistChangeLogReadModel(historyRow, changerNames))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));

  return {
    id: requireString(record.id, "setlist.id"),
    name: requireString(record.name, "setlist.name"),
    date: requireString(record.setlist_date, "setlist.setlist_date"),
    location: nullableString(record.location, "setlist.location") ?? "Main Sanctuary",
    callTime: formatWebsiteTime(record.call_time, "09:00"),
    rehearsalTime: formatWebsiteTime(record.rehearsal_time, "08:00"),
    serviceTimes,
    eventType: eventType ?? undefined,
    eventLabel: getSetlistTypeLabel({ eventType, serviceTimes }),
    leader: getLeaderName(record.leader),
    songs: slotRows
      .map((slotRow) => getSetlistSlotReadModel(slotRow, songsById))
      .filter((slot): slot is MobileSetlistSlotReadModel => slot !== null)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    notes: nullableString(record.notes, "setlist.notes") ?? undefined,
    eventId: nullableString(record.event_id, "setlist.event_id") ?? undefined,
    leaderMemberId: nullableString(record.leader_member_id, "setlist.leader_member_id"),
    createdBy: requireString(record.created_by, "setlist.created_by"),
    presentationSettings: nullableJson(record.presentation_settings, "setlist.presentation_settings"),
    history,
  };
}

function getSetlistSlotReadModel(value: unknown, songsById: ReadonlyMap<string, MobileSongReadModel>): MobileSetlistSlotReadModel | null {
  const record = requireRecord(value, "setlist song");
  if (record.song === null) return null;
  const song = requireRecord(record.song, "setlist song.song");
  const lyricsChords = requireString(song.lyrics_chords, "setlist song.song.lyrics_chords");
  const songId = requireString(song.id, "setlist song.song.id");
  const librarySong = songsById.get(songId);
  const originalKey = requireString(song.original_key, "setlist song.song.original_key");
  const assignedKey = requireString(record.assigned_key, "setlist song.assigned_key");
  const notes = nullableString(record.notes, "setlist song.notes");
  const leadMemberId = nullableString(record.lead_member_id, "setlist song.lead_member_id");
  const songYoutubeUrl = optionalString(song.youtube_url, "setlist song.song.youtube_url");

  return {
    id: requireString(record.id, "setlist song.id"),
    order: requireNumber(record.song_order, "setlist song.song_order"),
    assignedKey,
    lead: parseSongSlotNotes(notes).lead,
    arrangement: nullableString(record.arrangement, "setlist song.arrangement"),
    bandNotes: nullableString(record.band_notes, "setlist song.band_notes"),
    leadMemberId,
    youtubeUrl: nullableString(record.youtube_url, "setlist song.youtube_url"),
    notes,
    slideSettings: nullableJson(record.slide_settings, "setlist song.slide_settings"),
    createdAt: requireString(record.created_at, "setlist song.created_at"),
    song: {
      id: songId,
      title: requireString(song.title, "setlist song.song.title"),
      artist: requireString(song.artist, "setlist song.song.artist"),
      currentKey: assignedKey,
      timeSignature: nullableString(song.time_signature, "setlist song.song.time_signature") ?? "4/4",
      tags: nullableStringArray(song.tags, "setlist song.song.tags") ?? [],
      favorite: librarySong?.favorite ?? false,
      bpm: optionalNumber(song.bpm, "setlist song.song.bpm"),
      originalKey,
      lyricsChords,
      sections: parseLyricsAndChords(lyricsChords),
      ...(librarySong?.spotifyUrl ? { spotifyUrl: librarySong.spotifyUrl } : {}),
      ...(librarySong?.imageUrl ? { imageUrl: librarySong.imageUrl } : {}),
      ...(librarySong?.album ? { album: librarySong.album } : {}),
      ...(librarySong?.playCount !== undefined ? { playCount: librarySong.playCount } : {}),
      ...(songYoutubeUrl ? { youtubeUrl: songYoutubeUrl } : {}),
    },
  };
}

function getSetlistChangeLogReadModel(value: unknown, changerNames: ReadonlyMap<string, string>): MobileSetlistHistoryEntry {
  const record = requireRecord(value, "setlist history");
  const changedById = nullableString(record.changed_by, "setlist history.changed_by");
  const changeType = requireChangeType(record.change_type);

  return {
    id: requireString(record.id, "setlist history.id"),
    changeType,
    summary: requireString(record.summary, "setlist history.summary"),
    changedBy: changedById ? changerNames.get(changedById) ?? "Team member" : "System",
    createdAt: requireString(record.created_at, "setlist history.created_at"),
    snapshot: requireJson(record.snapshot, "setlist history.snapshot"),
  };
}

function getPlayCount(value: unknown): number {
  const relation = Array.isArray(value) ? value[0] : value;
  const count = requireNumber(requireRecord(relation, "song.setlist_songs").count, "song.setlist_songs.count");
  if (!Number.isInteger(count) || count < 0) throw new LibraryReadModelError("song.setlist_songs.count is invalid.");
  return count;
}

function getEventType(value: unknown): EventType | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (relation === null || relation === undefined) return null;
  const record = requireRecord(relation, "setlist.events");
  if (record.type === null || record.type === undefined) return null;
  if (typeof record.type !== "string" || !isEventType(record.type)) {
    throw new LibraryReadModelError("Setlist event type is invalid.");
  }
  return record.type;
}

function getLeaderName(value: unknown): string {
  const relation = Array.isArray(value) ? value[0] : value;
  if (relation === null || relation === undefined) return "Worship Leader";
  const record = requireRecord(relation, "setlist.leader");
  const profiles = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles;
  if (profiles === null || profiles === undefined) return "Worship Leader";
  const profile = requireRecord(profiles, "setlist.leader.profiles");
  return nullableString(profile.full_name, "setlist.leader.profiles.full_name") ?? "Worship Leader";
}

function formatWebsiteTime(value: unknown, fallback: string): string {
  const time = nullableString(value, "setlist time");
  return time?.slice(0, 5) || fallback;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LibraryReadModelError(`${field} is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new LibraryReadModelError(`${field} is invalid.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, field);
}

function optionalString(value: unknown, field: string): string | undefined {
  return nullableString(value, field) ?? undefined;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return requireNumber(value, field);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LibraryReadModelError(`${field} is invalid.`);
  }
  return value;
}

function nullableStringArray(value: unknown, field: string): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new LibraryReadModelError(`${field} is invalid.`);
  }
  return value;
}

function nullableJson(value: unknown, field: string): Json | null {
  return value === null || value === undefined ? null : requireJson(value, field);
}

function requireJson(value: unknown, field: string): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry) => requireJson(entry, field));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, requireJson(entry, `${field}.${key}`)]));
  }
  throw new LibraryReadModelError(`${field} is invalid.`);
}

function requireChangeType(value: unknown): SetlistChangeLog["changeType"] {
  if (typeof value !== "string" || !isChangeType(value)) {
    throw new LibraryReadModelError("Setlist history change type is invalid.");
  }
  return value;
}

function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value);
}

function isChangeType(value: string): value is SetlistChangeLog["changeType"] {
  return CHANGE_TYPE_SET.has(value);
}
