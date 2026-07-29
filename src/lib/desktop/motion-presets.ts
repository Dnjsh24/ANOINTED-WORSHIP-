import type { BlockMotion } from "@/lib/domain/presentation";
import { getDesktopDatabase, newMutationId, nowIso } from "@/lib/desktop/db";

export type DesktopMotionPreset = { id: string; name: string; motion: BlockMotion; updatedAt: string };
type MotionPresetRow = { id: string; name: string; motion_json: string; updated_at: string };

function parseMotion(raw: string): BlockMotion {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const fields = ["entranceAnimation", "entranceDuration", "entranceDelay", "entranceCurve", "exitAnimation", "exitDuration", "exitDelay", "exitCurve"] as const;
    return Object.fromEntries(fields.filter((field) => typeof value[field] === "string" || typeof value[field] === "number").map((field) => [field, value[field]])) as BlockMotion;
  } catch { return {}; }
}

export function listDesktopMotionPresets(teamId: string): DesktopMotionPreset[] {
  return (getDesktopDatabase().prepare(
    "SELECT id, name, motion_json, updated_at FROM desktop_motion_presets WHERE team_id = ? ORDER BY name COLLATE NOCASE",
  ).all(teamId) as MotionPresetRow[]).map((row) => ({ id: row.id, name: row.name, motion: parseMotion(row.motion_json), updatedAt: row.updated_at }));
}

export function saveDesktopMotionPreset(teamId: string, name: string, motion: BlockMotion) {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("A motion preset needs a name.");
  const timestamp = nowIso();
  getDesktopDatabase().prepare(`
    INSERT INTO desktop_motion_presets (id, team_id, name, motion_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id, name) DO UPDATE SET motion_json = excluded.motion_json, updated_at = excluded.updated_at
  `).run(newMutationId(), teamId, cleanName, JSON.stringify(motion), timestamp, timestamp);
  return listDesktopMotionPresets(teamId);
}

export function deleteDesktopMotionPreset(teamId: string, presetId: string) {
  getDesktopDatabase().prepare("DELETE FROM desktop_motion_presets WHERE id = ? AND team_id = ?").run(presetId, teamId);
  return listDesktopMotionPresets(teamId);
}
