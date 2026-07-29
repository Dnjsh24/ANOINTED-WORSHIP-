import { getDesktopDataDirectory } from "@/lib/desktop/runtime";
import { getDesktopDatabase, newMutationId, nowIso, withDesktopTransaction } from "@/lib/desktop/db";

// Resolve Node built-ins only at desktop-server runtime. Static fs/path calls
// made Turbopack enumerate every imported background in the Windows workspace.
function desktopNodeBuiltins() {
  const getBuiltinModule = (process as typeof process & { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  if (!getBuiltinModule) throw new Error("Desktop background media requires the bundled Electron Node runtime.");
  return {
    fs: getBuiltinModule("node:fs") as typeof import("node:fs"),
    path: getBuiltinModule("node:path") as typeof import("node:path"),
  };
}

export type DesktopBackgroundAsset = {
  id: string;
  displayName: string;
  mediaType: "image" | "video";
  contentType: string;
  sizeBytes: number;
  favorite: boolean;
  createdAt: string;
  url: string;
  collectionIds: string[];
};

type AssetRow = {
  id: string;
  storage_name: string;
  display_name: string;
  media_type: "image" | "video";
  content_type: string;
  size_bytes: number;
  favorite: number;
  created_at: string;
};

export function isSafeDesktopBackgroundStorageName(value: string) {
  return /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(value);
}

function desktopBackgroundPath(storageName: string) {
  return desktopNodeBuiltins().path.join(getDesktopDataDirectory(), "backgrounds", storageName);
}

export type ImportedDesktopBackground = {
  id: string;
  storageName: string;
  displayName: string;
  mediaType: "image" | "video";
  contentType: string;
  sizeBytes: number;
};

function assetUrl(id: string) {
  return `/api/desktop/backgrounds/${encodeURIComponent(id)}`;
}

function toAsset(row: AssetRow): DesktopBackgroundAsset {
  const collectionRows = getDesktopDatabase().prepare(
    "SELECT collection_id FROM desktop_background_collection_assets WHERE asset_id = ?",
  ).all(row.id) as { collection_id: string }[];
  return {
    id: row.id,
    displayName: row.display_name,
    mediaType: row.media_type,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    favorite: Boolean(row.favorite),
    createdAt: row.created_at,
    url: assetUrl(row.id),
    collectionIds: collectionRows.map((item) => item.collection_id),
  };
}

export function listDesktopBackgroundAssets(teamId: string): DesktopBackgroundAsset[] {
  const rows = getDesktopDatabase().prepare(
    "SELECT * FROM desktop_background_assets WHERE team_id = ? ORDER BY favorite DESC, created_at DESC",
  ).all(teamId) as AssetRow[];
  return rows.map(toAsset);
}

export function listDesktopBackgroundCollections(teamId: string) {
  return getDesktopDatabase().prepare(
    "SELECT id, name FROM desktop_background_collections WHERE team_id = ? ORDER BY name COLLATE NOCASE",
  ).all(teamId) as { id: string; name: string }[];
}

export function registerDesktopBackgroundImports(teamId: string, imports: ImportedDesktopBackground[]) {
  const timestamp = nowIso();
  withDesktopTransaction((db) => {
    const statement = db.prepare(`
      INSERT INTO desktop_background_assets (id, team_id, storage_name, display_name, media_type, content_type, size_bytes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    for (const item of imports) {
      if (!isSafeDesktopBackgroundStorageName(item.storageName)) continue;
      statement.run(item.id, teamId, item.storageName, item.displayName, item.mediaType, item.contentType, item.sizeBytes, timestamp, timestamp);
    }
  });
  return listDesktopBackgroundAssets(teamId);
}

export function renameDesktopBackground(teamId: string, assetId: string, displayName: string) {
  const safeName = displayName.trim().slice(0, 120);
  if (!safeName) throw new Error("A background needs a name.");
  getDesktopDatabase().prepare(
    "UPDATE desktop_background_assets SET display_name = ?, updated_at = ? WHERE id = ? AND team_id = ?",
  ).run(safeName, nowIso(), assetId, teamId);
}

export function setDesktopBackgroundFavorite(teamId: string, assetId: string, favorite: boolean) {
  getDesktopDatabase().prepare(
    "UPDATE desktop_background_assets SET favorite = ?, updated_at = ? WHERE id = ? AND team_id = ?",
  ).run(favorite ? 1 : 0, nowIso(), assetId, teamId);
}

export function createDesktopBackgroundCollection(teamId: string, name: string) {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("A collection needs a name.");
  const id = newMutationId();
  const timestamp = nowIso();
  getDesktopDatabase().prepare(
    "INSERT INTO desktop_background_collections (id, team_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, teamId, cleanName, timestamp, timestamp);
  return { id, name: cleanName };
}

export function setDesktopBackgroundCollectionMembership(teamId: string, assetId: string, collectionId: string, enabled: boolean) {
  const allowed = getDesktopDatabase().prepare(
    `SELECT 1 FROM desktop_background_assets a JOIN desktop_background_collections c ON c.team_id = a.team_id
     WHERE a.id = ? AND a.team_id = ? AND c.id = ?`,
  ).get(assetId, teamId, collectionId);
  if (!allowed) throw new Error("That background or collection is unavailable.");
  if (enabled) {
    getDesktopDatabase().prepare(
      "INSERT OR IGNORE INTO desktop_background_collection_assets (collection_id, asset_id) VALUES (?, ?)",
    ).run(collectionId, assetId);
  } else {
    getDesktopDatabase().prepare(
      "DELETE FROM desktop_background_collection_assets WHERE collection_id = ? AND asset_id = ?",
    ).run(collectionId, assetId);
  }
}

export function setDesktopSetlistBackground(teamId: string, setlistId: string, assetId: string | null) {
  if (assetId) {
    const asset = getDesktopDatabase().prepare(
      "SELECT id FROM desktop_background_assets WHERE id = ? AND team_id = ?",
    ).get(assetId, teamId);
    if (!asset) throw new Error("That local background is unavailable.");
  }
  getDesktopDatabase().prepare(`
    INSERT INTO desktop_background_assignments (team_id, setlist_id, asset_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id, setlist_id) DO UPDATE SET asset_id = excluded.asset_id, updated_at = excluded.updated_at
  `).run(teamId, setlistId, assetId, nowIso());
}

export function getDesktopSetlistBackground(teamId: string, setlistId: string) {
  const result = getDesktopDatabase().prepare(`
    SELECT a.* FROM desktop_background_assignments assignment
    JOIN desktop_background_assets a ON a.id = assignment.asset_id
    WHERE assignment.team_id = ? AND assignment.setlist_id = ?
  `).get(teamId, setlistId) as AssetRow | undefined;
  return result ? toAsset(result) : null;
}

export function getDesktopBackgroundFile(teamId: string, assetId: string) {
  const row = getDesktopDatabase().prepare(
    "SELECT * FROM desktop_background_assets WHERE id = ? AND team_id = ?",
  ).get(assetId, teamId) as AssetRow | undefined;
  if (!row || !isSafeDesktopBackgroundStorageName(row.storage_name)) return null;
  const filePath = desktopBackgroundPath(row.storage_name);
  if (!desktopNodeBuiltins().fs.existsSync(filePath)) return null;
  return { filePath, contentType: row.content_type, sizeBytes: Number(row.size_bytes), mediaType: row.media_type };
}

export function deleteDesktopBackground(teamId: string, assetId: string) {
  const row = getDesktopDatabase().prepare(
    "SELECT storage_name FROM desktop_background_assets WHERE id = ? AND team_id = ?",
  ).get(assetId, teamId) as { storage_name: string } | undefined;
  if (!row) return;
  withDesktopTransaction((db) => {
    db.prepare("DELETE FROM desktop_background_assignments WHERE asset_id = ?").run(assetId);
    db.prepare("DELETE FROM desktop_background_assets WHERE id = ? AND team_id = ?").run(assetId, teamId);
  });
  if (!isSafeDesktopBackgroundStorageName(row.storage_name)) return;
  const path = desktopBackgroundPath(row.storage_name);
  const fs = desktopNodeBuiltins().fs;
  if (fs.existsSync(path)) fs.rmSync(path, { force: true });
}

export function getDesktopBackgroundStorageSummary(teamId: string) {
  const result = getDesktopDatabase().prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM desktop_background_assets WHERE team_id = ?",
  ).get(teamId) as { count: number; bytes: number };
  return { count: Number(result.count), bytes: Number(result.bytes) };
}
