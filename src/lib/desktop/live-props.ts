import type { LiveProp } from "@/lib/domain/presentation";
import { getDesktopDatabase, newMutationId, nowIso } from "@/lib/desktop/db";

export type DesktopLivePropPreset = { id: string; name: string; prop: LiveProp; updatedAt: string };

function parseProp(raw: string): LiveProp | null {
  try {
    const value = JSON.parse(raw) as LiveProp;
    return value && ["lower-third", "alert", "nursery", "logo"].includes(value.kind) ? value : null;
  } catch { return null; }
}

export function listDesktopLivePropPresets(teamId: string): DesktopLivePropPreset[] {
  const rows = getDesktopDatabase().prepare("SELECT id, name, payload_json, updated_at FROM desktop_live_props WHERE team_id = ? ORDER BY name COLLATE NOCASE").all(teamId) as { id: string; name: string; payload_json: string; updated_at: string }[];
  return rows.map((row) => ({ id: row.id, name: row.name, prop: parseProp(row.payload_json), updatedAt: row.updated_at })).filter((item): item is DesktopLivePropPreset => item.prop !== null);
}

export function saveDesktopLivePropPreset(teamId: string, name: string, prop: LiveProp) {
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!cleanName) throw new Error("A prop preset needs a name.");
  if (JSON.stringify(prop).length > 8_000) throw new Error("Prop preset is too large.");
  const db = getDesktopDatabase(); const now = nowIso();
  const existing = db.prepare("SELECT id FROM desktop_live_props WHERE team_id = ? AND name = ?").get(teamId, cleanName) as { id: string } | undefined;
  const id = existing?.id ?? newMutationId();
  db.prepare("INSERT INTO desktop_live_props (id, team_id, name, payload_json, active, updated_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT(team_id, name) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at").run(id, teamId, cleanName, JSON.stringify(prop), now);
  return listDesktopLivePropPresets(teamId);
}

export function deleteDesktopLivePropPreset(teamId: string, id: string) {
  getDesktopDatabase().prepare("DELETE FROM desktop_live_props WHERE team_id = ? AND id = ?").run(teamId, id);
  return listDesktopLivePropPresets(teamId);
}
