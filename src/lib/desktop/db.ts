import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDesktopDataDirectory } from "@/lib/desktop/runtime";

type DbHolder = { path: string; db: DatabaseSync };

const globalForDesktopDb = globalThis as typeof globalThis & { __anointedDesktopDb?: DbHolder };

function initialize(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS workspace_context (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_code TEXT,
      role TEXT NOT NULL,
      custom_permissions TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, team_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS workspace_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS local_songs (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      original_key TEXT NOT NULL,
      bpm INTEGER,
      time_signature TEXT NOT NULL,
      lyrics_chords TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      youtube_url TEXT,
      spotify_url TEXT,
      image_url TEXT,
      album TEXT,
      deleted_at TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS local_songs_team_title_idx ON local_songs(team_id, title);

    CREATE TABLE IF NOT EXISTS local_events (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      location TEXT,
      starts_at TEXT,
      deleted_at TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS local_setlists (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      event_id TEXT,
      name TEXT NOT NULL,
      setlist_date TEXT NOT NULL,
      location TEXT,
      call_time TEXT,
      rehearsal_time TEXT,
      service_times TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      presentation_settings TEXT NOT NULL DEFAULT '{}',
      deleted_at TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS local_setlists_team_date_idx ON local_setlists(team_id, setlist_date DESC);

    CREATE TABLE IF NOT EXISTS local_setlist_songs (
      id TEXT PRIMARY KEY,
      setlist_id TEXT NOT NULL REFERENCES local_setlists(id) ON DELETE CASCADE,
      song_id TEXT NOT NULL REFERENCES local_songs(id),
      song_order INTEGER NOT NULL,
      assigned_key TEXT NOT NULL,
      notes TEXT,
      arrangement TEXT,
      band_notes TEXT,
      slide_settings TEXT,
      deleted_at TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS local_setlist_songs_setlist_idx ON local_setlist_songs(setlist_id, song_order);

    CREATE TABLE IF NOT EXISTS local_annotations (
      id TEXT PRIMARY KEY,
      setlist_song_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      canvas_data TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE (setlist_song_id, profile_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS presentation_assets (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      content_type TEXT,
      size_bytes INTEGER,
      sha256 TEXT,
      local_path TEXT,
      download_state TEXT NOT NULL DEFAULT 'pending',
      deleted_at TEXT,
      sync_revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sync_outbox (
      mutation_id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      base_revision INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      base_snapshot TEXT,
      dependency_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sync_outbox_status_idx ON sync_outbox(status, created_at);

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      cloud_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS presenter_live_state (
      setlist_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    -- These tables deliberately have no cloud equivalent. They belong to the
    -- Windows presenter workstation, never to a team sync payload.
    CREATE TABLE IF NOT EXISTS desktop_background_assets (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS desktop_background_assets_team_idx ON desktop_background_assets(team_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS desktop_background_collections (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (team_id, name)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS desktop_background_collection_assets (
      collection_id TEXT NOT NULL REFERENCES desktop_background_collections(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES desktop_background_assets(id) ON DELETE CASCADE,
      PRIMARY KEY (collection_id, asset_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS desktop_background_assignments (
      team_id TEXT NOT NULL,
      setlist_id TEXT NOT NULL,
      asset_id TEXT REFERENCES desktop_background_assets(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_id, setlist_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS desktop_output_preferences (
      output_kind TEXT PRIMARY KEY,
      display_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    -- Motion presets are workstation tools. They are intentionally excluded
    -- from setlist presentation settings and the cloud sync outbox.
    CREATE TABLE IF NOT EXISTS desktop_motion_presets (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      motion_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (team_id, name)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS desktop_motion_presets_team_idx ON desktop_motion_presets(team_id, updated_at DESC);

    -- Scene layers are production-workstation data. Their media URLs and
    -- layouts must never be added to the team synchronisation outbox.
    CREATE TABLE IF NOT EXISTS desktop_scene_layer_slides (
      team_id TEXT NOT NULL,
      setlist_id TEXT NOT NULL,
      slide_id TEXT NOT NULL,
      layers_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_id, setlist_id, slide_id)
    ) STRICT;

    -- Local production configuration: no equivalent cloud entities exist.
    CREATE TABLE IF NOT EXISTS desktop_audience_looks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(team_id, name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS desktop_output_configs (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_id TEXT,
      look_id TEXT REFERENCES desktop_audience_looks(id) ON DELETE SET NULL,
      route TEXT NOT NULL CHECK(route IN ('projector', 'confidence', 'stream', 'lobby')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
      updated_at TEXT NOT NULL,
      UNIQUE(team_id, name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS desktop_live_props (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
      updated_at TEXT NOT NULL,
      UNIQUE(team_id, name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS desktop_imported_presentations (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      presentation_json TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS bible_verses (
      translation TEXT NOT NULL,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (translation, book, chapter, verse)
    ) STRICT;
  `);
}

export function getDesktopDatabase() {
  const dataDirectory = getDesktopDataDirectory();
  const databaseDirectory = join(dataDirectory, "offline");
  mkdirSync(databaseDirectory, { recursive: true });
  const databasePath = join(databaseDirectory, "workspace.sqlite");

  if (globalForDesktopDb.__anointedDesktopDb?.path === databasePath) {
    return globalForDesktopDb.__anointedDesktopDb.db;
  }

  globalForDesktopDb.__anointedDesktopDb?.db.close();
  const db = new DatabaseSync(databasePath, { timeout: 5000, defensive: true });
  initialize(db);
  globalForDesktopDb.__anointedDesktopDb = { path: databasePath, db };
  return db;
}

export function withDesktopTransaction<T>(work: (db: DatabaseSync) => T): T {
  const db = getDesktopDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function newMutationId() {
  return randomUUID();
}
