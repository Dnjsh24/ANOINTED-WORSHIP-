import type { Permission } from "@/lib/domain/rbac";
import { parseLyricsAndChords } from "@/lib/domain/chords";
import { getEffectiveAssignedKey } from "@/lib/domain/setlists";
import { getDesktopDatabase, newMutationId, nowIso, withDesktopTransaction } from "@/lib/desktop/db";
import type { TeamContext } from "@/lib/supabase/team-context";
import type { Setlist, Song, TeamRole } from "@/lib/types";

type Row = Record<string, unknown>;

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rows(sql: string, ...params: unknown[]) {
  return getDesktopDatabase().prepare(sql).all(...params) as Row[];
}

function row(sql: string, ...params: unknown[]) {
  return getDesktopDatabase().prepare(sql).get(...params) as Row | undefined;
}

export function saveDesktopTeamContext(context: TeamContext) {
  if (!context.userId || !context.teamId || !context.memberId) return;
  const timestamp = nowIso();
  getDesktopDatabase().prepare(`
    INSERT INTO workspace_context (user_id, team_id, member_id, team_name, team_code, role, custom_permissions, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, team_id) DO UPDATE SET
      member_id = excluded.member_id, team_name = excluded.team_name, team_code = excluded.team_code,
      role = excluded.role, custom_permissions = excluded.custom_permissions, updated_at = excluded.updated_at
  `).run(
    context.userId,
    context.teamId,
    context.memberId,
    context.teamName,
    context.teamCode,
    context.role,
    JSON.stringify(context.customPermissions ?? []),
    timestamp,
  );
  getDesktopDatabase().prepare(`
    INSERT INTO workspace_state (key, value, updated_at) VALUES ('active_context', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify({ userId: context.userId, teamId: context.teamId }), timestamp);
}

export function getDesktopTeamContext(): TeamContext | null {
  const active = row("SELECT value FROM workspace_state WHERE key = 'active_context'");
  const key = json<{ userId?: string; teamId?: string }>(active?.value, {});
  if (!key.userId || !key.teamId) return null;
  const context = row(
    "SELECT * FROM workspace_context WHERE user_id = ? AND team_id = ?",
    key.userId,
    key.teamId,
  );
  if (!context) return null;
  const permissions = json<Permission[]>(context.custom_permissions, []);
  return {
    userId: String(context.user_id),
    teamId: String(context.team_id),
    memberId: String(context.member_id),
    teamName: String(context.team_name),
    teamCode: context.team_code ? String(context.team_code) : null,
    role: String(context.role) as TeamRole,
    customPermissions: permissions,
    canManageMembers: false,
    hasPendingJoinRequest: false,
  };
}

export function lockDesktopWorkspace() {
  getDesktopDatabase().prepare("DELETE FROM workspace_state WHERE key = 'active_context'").run();
}

export function saveDesktopPresenterLiveState(setlistId: string, payload: unknown) {
  const current = getDesktopPresenterLiveState(setlistId);
  const next = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { ...current, ...(payload as Record<string, unknown>) }
    : payload;
  getDesktopDatabase().prepare(`
    INSERT INTO presenter_live_state (setlist_id, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setlist_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(setlistId, JSON.stringify(next), nowIso());
}

export function getDesktopPresenterLiveState(setlistId: string) {
  const result = row("SELECT payload FROM presenter_live_state WHERE setlist_id = ?", setlistId);
  return json<Record<string, unknown>>(result?.payload, {});
}

export function saveDesktopPresenterDraft(teamId: string, setlistId: string, presentationSettings: unknown) {
  const existing = row("SELECT * FROM local_setlists WHERE id = ? AND team_id = ? AND deleted_at IS NULL", setlistId, teamId);
  if (!existing) throw new Error("The setlist is not available in this offline workspace.");
  const serialized = JSON.stringify(presentationSettings ?? {});
  if (serialized.length > 2_000_000) throw new Error("The Presenter draft is too large to save.");
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    db.prepare("UPDATE local_setlists SET presentation_settings = ?, updated_at = ? WHERE id = ? AND team_id = ?")
      .run(serialized, timestamp, setlistId, teamId);
    // A draft may be saved repeatedly before the PC reconnects. Only the
    // latest presentation payload should be pushed against the cloud base
    // revision; older pending drafts would otherwise conflict with each other.
    db.prepare("DELETE FROM sync_outbox WHERE command = 'setlist.presentation.update' AND entity_id = ? AND status = 'pending'")
      .run(setlistId);
    queueDesktopMutation({
      command: "setlist.presentation.update",
      entityType: "setlist",
      entityId: setlistId,
      baseRevision: Number(existing.sync_revision ?? 0),
      payload: { id: setlistId, teamId, presentationSettings },
      baseSnapshot: existing,
    });
  });
}

export function listDesktopSongs(teamId: string): Song[] {
  return rows(
    "SELECT * FROM local_songs WHERE team_id = ? AND deleted_at IS NULL ORDER BY title COLLATE NOCASE",
    teamId,
  ).map(toSong);
}

export function getDesktopSong(teamId: string, id: string): Song | null {
  const result = row("SELECT * FROM local_songs WHERE team_id = ? AND id = ?", teamId, id);
  return result && !result.deleted_at ? toSong(result) : null;
}

function toSong(value: Row): Song {
  return {
    id: String(value.id),
    title: String(value.title),
    artist: String(value.artist),
    originalKey: String(value.original_key),
    currentKey: String(value.original_key),
    bpm: typeof value.bpm === "number" ? value.bpm : null,
    timeSignature: String(value.time_signature),
    tags: json<string[]>(value.tags, []),
    favorite: false,
    sections: parseLyricsAndChords(String(value.lyrics_chords)),
    rawLyricsChords: String(value.lyrics_chords),
    youtubeUrl: value.youtube_url ? String(value.youtube_url) : undefined,
    spotifyUrl: value.spotify_url ? String(value.spotify_url) : undefined,
    imageUrl: value.image_url ? String(value.image_url) : undefined,
    album: value.album ? String(value.album) : undefined,
  };
}

export function listDesktopSetlists(teamId: string): Setlist[] {
  const setlists = rows(
    "SELECT * FROM local_setlists WHERE team_id = ? AND deleted_at IS NULL ORDER BY setlist_date DESC",
    teamId,
  );
  return setlists.map((setlist) => toSetlist(setlist));
}

export function getDesktopSetlist(teamId: string, id: string): Setlist | null {
  const setlist = row("SELECT * FROM local_setlists WHERE team_id = ? AND id = ?", teamId, id);
  return setlist && !setlist.deleted_at ? toSetlist(setlist) : null;
}

function toSetlist(setlist: Row): Setlist {
  const songs = rows(`
    SELECT ss.*, s.title, s.artist, s.original_key, s.bpm, s.time_signature, s.lyrics_chords, s.tags,
      s.youtube_url, s.spotify_url, s.image_url, s.album
    FROM local_setlist_songs ss
    JOIN local_songs s ON s.id = ss.song_id
    WHERE ss.setlist_id = ? AND ss.deleted_at IS NULL AND s.deleted_at IS NULL
    ORDER BY ss.song_order
  `, setlist.id).map((item) => ({
    id: String(item.id),
    order: Number(item.song_order),
    assignedKey: getEffectiveAssignedKey(String(item.assigned_key), String(item.original_key)),
    lead: typeof item.notes === "string" && item.notes.startsWith("Lead: ") ? item.notes.slice(6) : undefined,
    arrangement: item.arrangement ? String(item.arrangement) : null,
    bandNotes: item.band_notes ? String(item.band_notes) : null,
    song: toSong({
      id: item.song_id,
      title: item.title,
      artist: item.artist,
      original_key: item.original_key,
      bpm: item.bpm,
      time_signature: item.time_signature,
      lyrics_chords: item.lyrics_chords,
      tags: item.tags,
      youtube_url: item.youtube_url,
      spotify_url: item.spotify_url,
      image_url: item.image_url,
      album: item.album,
    }),
  }));
  return {
    id: String(setlist.id),
    name: String(setlist.name),
    date: String(setlist.setlist_date),
    leader: "Worship Leader",
    location: setlist.location ? String(setlist.location) : "Main Sanctuary",
    callTime: setlist.call_time ? String(setlist.call_time).slice(0, 5) : "09:00",
    rehearsalTime: setlist.rehearsal_time ? String(setlist.rehearsal_time).slice(0, 5) : "08:00",
    serviceTimes: json<string[]>(setlist.service_times, ["Sunday Worship"]),
    notes: setlist.notes ? String(setlist.notes) : undefined,
    eventId: setlist.event_id ? String(setlist.event_id) : undefined,
    presentationSettings: json<Record<string, unknown>>(setlist.presentation_settings, {}),
    songs,
  } as Setlist & { presentationSettings?: Record<string, unknown> };
}

export function queueDesktopMutation(input: {
  command: string;
  entityType: string;
  entityId: string;
  baseRevision?: number;
  payload: unknown;
  baseSnapshot?: unknown;
  dependencyIds?: string[];
}) {
  const timestamp = nowIso();
  getDesktopDatabase().prepare(`
    INSERT INTO sync_outbox (mutation_id, command, entity_type, entity_id, base_revision, payload, base_snapshot, dependency_ids, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    newMutationId(),
    input.command,
    input.entityType,
    input.entityId,
    input.baseRevision ?? 0,
    JSON.stringify(input.payload),
    input.baseSnapshot === undefined ? null : JSON.stringify(input.baseSnapshot),
    JSON.stringify(input.dependencyIds ?? []),
    timestamp,
    timestamp,
  );
}

export function upsertDesktopSong(input: {
  id: string;
  teamId: string;
  title: string;
  artist: string;
  originalKey: string;
  bpm: number | null;
  timeSignature: string;
  lyricsChords: string;
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
  imageUrl?: string | null;
  album?: string | null;
  tags?: string[];
  syncRevision?: number;
  updatedAt?: string;
  queue?: boolean;
}) {
  const existing = row("SELECT * FROM local_songs WHERE id = ?", input.id);
  const payload = { ...input, queue: undefined };
  withDesktopTransaction((db) => {
    db.prepare(`
      INSERT INTO local_songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, tags, youtube_url, spotify_url, image_url, album, deleted_at, sync_revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, artist = excluded.artist, original_key = excluded.original_key, bpm = excluded.bpm,
        time_signature = excluded.time_signature, lyrics_chords = excluded.lyrics_chords, tags = excluded.tags,
        youtube_url = excluded.youtube_url, spotify_url = excluded.spotify_url, image_url = excluded.image_url,
        album = excluded.album, deleted_at = NULL, sync_revision = excluded.sync_revision, updated_at = excluded.updated_at
    `).run(
      input.id, input.teamId, input.title, input.artist, input.originalKey, input.bpm, input.timeSignature,
      input.lyricsChords, JSON.stringify(input.tags ?? []), input.youtubeUrl ?? null, input.spotifyUrl ?? null,
      input.imageUrl ?? null, input.album ?? null, input.syncRevision ?? Number(existing?.sync_revision ?? 0), input.updatedAt ?? nowIso(),
    );
    if (input.queue) {
      queueDesktopMutation({
        command: existing ? "song.update" : "song.create",
        entityType: "song",
        entityId: input.id,
        baseRevision: Number(existing?.sync_revision ?? 0),
        payload,
        baseSnapshot: existing,
      });
    }
  });
}

export function softDeleteDesktopSong(id: string) {
  const existing = row("SELECT * FROM local_songs WHERE id = ?", id);
  if (!existing) return;
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    db.prepare("UPDATE local_songs SET deleted_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
    queueDesktopMutation({
      command: "song.delete",
      entityType: "song",
      entityId: id,
      baseRevision: Number(existing.sync_revision ?? 0),
      payload: { id, deletedAt: timestamp },
      baseSnapshot: existing,
    });
  });
}

export function upsertDesktopSetlist(input: {
  id: string;
  eventId?: string | null;
  teamId: string;
  name: string;
  date: string;
  eventType: string;
  location?: string | null;
  callTime?: string | null;
  rehearsalTime?: string | null;
  serviceTimes: string[];
  notes?: string | null;
  queue?: boolean;
}) {
  const existing = row("SELECT * FROM local_setlists WHERE id = ?", input.id);
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    if (input.eventId) {
      const linkedEvent = db.prepare(
        "SELECT id FROM local_events WHERE id = ? AND team_id = ? AND deleted_at IS NULL",
      ).get(input.eventId, input.teamId);
      if (!linkedEvent) throw new Error("The selected Timeline event is unavailable.");
    }
    db.prepare(`INSERT INTO local_setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, presentation_settings, deleted_at, sync_revision, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET event_id=excluded.event_id, name=excluded.name, setlist_date=excluded.setlist_date, location=excluded.location, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, service_times=excluded.service_times, notes=excluded.notes, deleted_at=NULL, updated_at=excluded.updated_at`).run(
      input.id, input.teamId, input.eventId ?? null, input.name, input.date, input.location ?? null, input.callTime ?? null, input.rehearsalTime ?? null, JSON.stringify(input.serviceTimes), input.notes ?? null, Number(existing?.sync_revision ?? 0), timestamp,
    );
    if (input.queue) queueDesktopMutation({
      command: existing ? "setlist.update" : "setlist.create",
      entityType: "setlist",
      entityId: input.id,
      baseRevision: Number(existing?.sync_revision ?? 0),
      payload: input,
      baseSnapshot: existing,
    });
  });
}

export function softDeleteDesktopSetlist(id: string) {
  const existing = row("SELECT * FROM local_setlists WHERE id = ?", id);
  if (!existing) return;
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    db.prepare("UPDATE local_setlists SET deleted_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, id);
    db.prepare("UPDATE local_setlist_songs SET deleted_at = ?, updated_at = ? WHERE setlist_id = ?").run(timestamp, timestamp, id);
    queueDesktopMutation({ command: "setlist.delete", entityType: "setlist", entityId: id, baseRevision: Number(existing.sync_revision ?? 0), payload: { id, teamId: existing.team_id, deletedAt: timestamp }, baseSnapshot: existing });
  });
}

export function restoreDesktopSong(id: string) {
  const existing = row("SELECT * FROM local_songs WHERE id = ?", id);
  if (!existing) return;
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    db.prepare("UPDATE local_songs SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(timestamp, id);
    queueDesktopMutation({
      command: "song.restore",
      entityType: "song",
      entityId: id,
      baseRevision: Number(existing.sync_revision ?? 0),
      payload: { id, deletedAt: null },
      baseSnapshot: existing,
    });
  });
}

export function replaceDesktopSnapshot(input: {
  context: TeamContext;
  songs: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  setlists: Array<Record<string, unknown>>;
  setlistSongs: Array<Record<string, unknown>>;
}) {
  saveDesktopTeamContext(input.context);
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    for (const song of input.songs) {
      db.prepare(`
        INSERT INTO local_songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, tags, youtube_url, spotify_url, image_url, album, deleted_at, sync_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, artist=excluded.artist, original_key=excluded.original_key,
          bpm=excluded.bpm, time_signature=excluded.time_signature, lyrics_chords=excluded.lyrics_chords, tags=excluded.tags,
          youtube_url=excluded.youtube_url, spotify_url=excluded.spotify_url, image_url=excluded.image_url, album=excluded.album,
          deleted_at=excluded.deleted_at, sync_revision=excluded.sync_revision, updated_at=excluded.updated_at
      `).run(
        song.id, song.team_id, song.title, song.artist, song.original_key, song.bpm ?? null, song.time_signature,
        song.lyrics_chords, JSON.stringify(song.tags ?? []), song.youtube_url ?? null, song.spotify_url ?? null,
        song.image_url ?? null, song.album ?? null, song.deleted_at ?? null, song.sync_revision ?? 0, song.updated_at ?? timestamp,
      );
    }
    for (const event of input.events) {
      db.prepare(`INSERT INTO local_events (id, team_id, name, type, event_date, location, starts_at, deleted_at, sync_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, event_date=excluded.event_date, location=excluded.location,
          starts_at=excluded.starts_at, deleted_at=excluded.deleted_at, sync_revision=excluded.sync_revision, updated_at=excluded.updated_at
      `).run(event.id, event.team_id, event.name ?? "Service", event.type ?? "service", event.event_date ?? event.date, event.location ?? null, event.starts_at ?? null, event.deleted_at ?? null, event.sync_revision ?? 0, event.updated_at ?? timestamp);
    }
    for (const setlist of input.setlists) {
      db.prepare(`INSERT INTO local_setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, presentation_settings, deleted_at, sync_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET event_id=excluded.event_id, name=excluded.name, setlist_date=excluded.setlist_date, location=excluded.location,
          call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, service_times=excluded.service_times, notes=excluded.notes,
          presentation_settings=excluded.presentation_settings, deleted_at=excluded.deleted_at, sync_revision=excluded.sync_revision, updated_at=excluded.updated_at
      `).run(setlist.id, setlist.team_id, setlist.event_id ?? null, setlist.name, setlist.setlist_date, setlist.location ?? null, setlist.call_time ?? null, setlist.rehearsal_time ?? null, JSON.stringify(setlist.service_times ?? []), setlist.notes ?? null, JSON.stringify(setlist.presentation_settings ?? {}), setlist.deleted_at ?? null, setlist.sync_revision ?? 0, setlist.updated_at ?? timestamp);
    }
    for (const item of input.setlistSongs) {
      db.prepare(`INSERT INTO local_setlist_songs (id, setlist_id, song_id, song_order, assigned_key, notes, arrangement, band_notes, slide_settings, deleted_at, sync_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET setlist_id=excluded.setlist_id, song_id=excluded.song_id, song_order=excluded.song_order,
          assigned_key=excluded.assigned_key, notes=excluded.notes, arrangement=excluded.arrangement, band_notes=excluded.band_notes,
          slide_settings=excluded.slide_settings, deleted_at=excluded.deleted_at, sync_revision=excluded.sync_revision, updated_at=excluded.updated_at
      `).run(item.id, item.setlist_id, item.song_id, item.song_order, item.assigned_key, item.notes ?? null, item.arrangement ?? null, item.band_notes ?? null, item.slide_settings ? JSON.stringify(item.slide_settings) : null, item.deleted_at ?? null, item.sync_revision ?? 0, item.updated_at ?? timestamp);
    }
  });
}

export function getDesktopSyncSummary() {
  const pending = row("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'");
  const conflicts = row("SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL");
  const mediaPending = row("SELECT COUNT(*) AS count FROM presentation_assets WHERE deleted_at IS NULL AND download_state <> 'downloaded'");
  const bibleTranslations = row(`SELECT COUNT(DISTINCT lower(translation)) AS count
    FROM bible_verses WHERE lower(translation) IN ('kjv', 'web', 'bbe')`);
  const lastSync = row("SELECT value FROM workspace_state WHERE key = 'last_sync_at'");
  return {
    pending: Number(pending?.count ?? 0),
    conflicts: Number(conflicts?.count ?? 0),
    mediaPending: Number(mediaPending?.count ?? 0),
    bibleTranslations: Number(bibleTranslations?.count ?? 0),
    lastSyncAt: typeof lastSync?.value === "string" ? lastSync.value : null,
  };
}

export function getDesktopSyncDetails() {
  const summary = getDesktopSyncSummary();
  const count = (sql: string) => Number(row(sql)?.count ?? 0);
  const recentChanges = rows(`SELECT command, entity_type, entity_id, payload, status, created_at, updated_at
    FROM sync_outbox ORDER BY updated_at DESC LIMIT 12`).map((change) => {
    const payload = json<Record<string, unknown>>(change.payload, {});
    const title = typeof payload.title === "string"
      ? payload.title
      : typeof payload.name === "string"
        ? payload.name
        : null;
    return {
      command: String(change.command),
      entityType: String(change.entity_type),
      entityId: String(change.entity_id),
      title,
      status: String(change.status),
      createdAt: String(change.created_at),
      updatedAt: String(change.updated_at),
    };
  });
  const conflictDetails = rows(`SELECT entity_type, entity_id, created_at FROM sync_conflicts
    WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 12`).map((conflict) => ({
    entityType: String(conflict.entity_type),
    entityId: String(conflict.entity_id),
    createdAt: String(conflict.created_at),
  }));

  return {
    ...summary,
    content: {
      songs: count("SELECT COUNT(*) AS count FROM local_songs WHERE deleted_at IS NULL"),
      setlists: count("SELECT COUNT(*) AS count FROM local_setlists WHERE deleted_at IS NULL"),
      setlistSongs: count("SELECT COUNT(*) AS count FROM local_setlist_songs WHERE deleted_at IS NULL"),
      annotations: count("SELECT COUNT(*) AS count FROM local_annotations"),
      bibleVerses: count("SELECT COUNT(*) AS count FROM bible_verses"),
      mediaTotal: count("SELECT COUNT(*) AS count FROM presentation_assets WHERE deleted_at IS NULL"),
      mediaDownloaded: count("SELECT COUNT(*) AS count FROM presentation_assets WHERE deleted_at IS NULL AND download_state = 'downloaded'"),
    },
    recentChanges,
    conflictDetails,
  };
}

export function findDesktopBibleVerses(query: string, translation: string) {
  const match = query.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return [];
  const [, book, chapterText, firstVerseText, lastVerseText] = match;
  const chapter = Number(chapterText);
  const firstVerse = Number(firstVerseText ?? 1);
  const lastVerse = Number(lastVerseText ?? 999);
  return rows(
    `SELECT book, chapter, verse, text FROM bible_verses
     WHERE lower(translation) = lower(?) AND lower(book) = lower(?) AND chapter = ? AND verse BETWEEN ? AND ?
     ORDER BY verse`,
    translation,
    book.trim(),
    chapter,
    firstVerse,
    lastVerse,
  ).map((verse) => ({
    reference: `${verse.book} ${verse.chapter}:${verse.verse}`,
    text: String(verse.text),
  }));
}

export function setDesktopSyncTimestamp() {
  const timestamp = nowIso();
  getDesktopDatabase().prepare(`INSERT INTO workspace_state (key, value, updated_at) VALUES ('last_sync_at', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(timestamp, timestamp);
}

export type DesktopMutation = {
  mutationId: string;
  command: string;
  entityType: string;
  entityId: string;
  baseRevision: number;
  payload: unknown;
  baseSnapshot: unknown;
  dependencyIds: string[];
};

export function listPendingDesktopMutations(): DesktopMutation[] {
  return rows("SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at").map((mutation) => ({
    mutationId: String(mutation.mutation_id),
    command: String(mutation.command),
    entityType: String(mutation.entity_type),
    entityId: String(mutation.entity_id),
    baseRevision: Number(mutation.base_revision),
    payload: json(mutation.payload, {}),
    baseSnapshot: json(mutation.base_snapshot, null),
    dependencyIds: json<string[]>(mutation.dependency_ids, []),
  }));
}

export function markDesktopMutationApplied(mutationId: string) {
  getDesktopDatabase().prepare("UPDATE sync_outbox SET status = 'applied', updated_at = ? WHERE mutation_id = ?").run(nowIso(), mutationId);
}

export function markDesktopMutationPending(mutationId: string) {
  getDesktopDatabase().prepare("UPDATE sync_outbox SET status = 'pending', updated_at = ? WHERE mutation_id = ?").run(nowIso(), mutationId);
}

export function recordDesktopConflict(input: {
  entityType: string;
  entityId: string;
  localPayload: unknown;
  cloudPayload: unknown;
  mutationId?: string;
}) {
  const id = newMutationId();
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    db.prepare("INSERT INTO sync_conflicts (id, entity_type, entity_id, local_payload, cloud_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      input.entityType,
      input.entityId,
      JSON.stringify(input.localPayload),
      JSON.stringify(input.cloudPayload),
      timestamp,
    );
    if (input.mutationId) {
      db.prepare("UPDATE sync_outbox SET status = 'conflict', updated_at = ? WHERE mutation_id = ?").run(timestamp, input.mutationId);
    }
  });
}
