import { getDesktopDatabase, newMutationId, nowIso } from "@/lib/desktop/db";
import { defaultAudienceLookLayout, normalizeAudienceLookLayout, type AudienceLookLayout } from "@/lib/desktop/audience-looks";

export type DesktopAudienceLook = { id: string; name: string; layout: AudienceLookLayout };
export type DesktopOutputConfig = { id: string; name: string; displayId: string | null; lookId: string | null; route: "projector" | "confidence" | "stream" | "lobby"; enabled: boolean };
export type DesktopOutputRoute = DesktopOutputConfig["route"];

function cleanName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error(`${label} must be between 1 and 80 characters.`);
  return name;
}

export function listDesktopProductionLayout(teamId: string) {
  const db = getDesktopDatabase();
  const looks = db.prepare("SELECT id, name, layout_json FROM desktop_audience_looks WHERE team_id = ? ORDER BY name COLLATE NOCASE").all(teamId) as { id: string; name: string; layout_json: string }[];
  const outputs = db.prepare("SELECT id, name, display_id, look_id, route, enabled FROM desktop_output_configs WHERE team_id = ? ORDER BY name COLLATE NOCASE").all(teamId) as { id: string; name: string; display_id: string | null; look_id: string | null; route: DesktopOutputConfig["route"]; enabled: number }[];
  return { looks: looks.map((row) => { let raw: unknown = {}; try { raw = JSON.parse(row.layout_json); } catch {} return { id: row.id, name: row.name, layout: normalizeAudienceLookLayout(raw, defaultAudienceLookLayout(row.name)) }; }), outputs: outputs.map((row) => ({ id: row.id, name: row.name, displayId: row.display_id, lookId: row.look_id, route: row.route, enabled: Boolean(row.enabled) })) };
}

export function seedDesktopProductionLayout(teamId: string) {
  const db = getDesktopDatabase(); const now = nowIso();
  for (const name of ["Main Projection", "Stream Lower Third", "Lobby", "Confidence"]) db.prepare("INSERT OR IGNORE INTO desktop_audience_looks (id, team_id, name, layout_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(newMutationId(), teamId, name, JSON.stringify(defaultAudienceLookLayout(name)), now, now);
  const looks = listDesktopProductionLayout(teamId).looks;
  for (const [name, route, lookName] of [["Main Projection", "projector", "Main Projection"], ["Confidence", "confidence", "Confidence"]] as const) {
    const look = looks.find((item) => item.name === lookName);
    db.prepare("INSERT OR IGNORE INTO desktop_output_configs (id, team_id, name, display_id, look_id, route, enabled, updated_at) VALUES (?, ?, ?, NULL, ?, ?, 1, ?)").run(newMutationId(), teamId, name, look?.id ?? null, route, now);
  }
  return listDesktopProductionLayout(teamId);
}

export function saveDesktopAudienceLook(teamId: string, input: { id?: string; name: string; layout?: Record<string, unknown> }) {
  const db = getDesktopDatabase(); const now = nowIso();
  const name = cleanName(input.name, "Look name");
  const layout = normalizeAudienceLookLayout(input.layout, defaultAudienceLookLayout(name));
  if (JSON.stringify(layout).length > 32_000) throw new Error("Look layout is too large.");
  if (input.id) {
    const changed = db.prepare("UPDATE desktop_audience_looks SET name = ?, layout_json = ?, updated_at = ? WHERE id = ? AND team_id = ?").run(name, JSON.stringify(layout), now, input.id, teamId);
    if (!changed.changes) throw new Error("Audience Look was not found.");
    return input.id;
  }
  const id = newMutationId();
  db.prepare("INSERT INTO desktop_audience_looks (id, team_id, name, layout_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, teamId, name, JSON.stringify(layout), now, now);
  return id;
}

export function deleteDesktopAudienceLook(teamId: string, lookId: string) {
  getDesktopDatabase().prepare("DELETE FROM desktop_audience_looks WHERE id = ? AND team_id = ?").run(lookId, teamId);
}

export function saveDesktopOutputConfig(teamId: string, input: { id?: string; name: string; displayId?: string | null; lookId?: string | null; route: DesktopOutputRoute; enabled?: boolean }) {
  const db = getDesktopDatabase(); const now = nowIso();
  const name = cleanName(input.name, "Output name");
  if (!['projector', 'confidence', 'stream', 'lobby'].includes(input.route)) throw new Error("Output route is invalid.");
  if (input.lookId) {
    const look = db.prepare("SELECT 1 FROM desktop_audience_looks WHERE id = ? AND team_id = ?").get(input.lookId, teamId);
    if (!look) throw new Error("Choose an Audience Look from this team.");
  }
  if (input.id) {
    const changed = db.prepare("UPDATE desktop_output_configs SET name = ?, display_id = ?, look_id = ?, route = ?, enabled = ?, updated_at = ? WHERE id = ? AND team_id = ?").run(name, input.displayId ?? null, input.lookId ?? null, input.route, input.enabled === false ? 0 : 1, now, input.id, teamId);
    if (!changed.changes) throw new Error("Output was not found.");
    return input.id;
  }
  const count = db.prepare("SELECT COUNT(*) AS count FROM desktop_output_configs WHERE team_id = ?").get(teamId) as { count: number };
  if (count.count >= 16) throw new Error("A maximum of 16 logical outputs is supported.");
  const id = newMutationId();
  db.prepare("INSERT INTO desktop_output_configs (id, team_id, name, display_id, look_id, route, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, teamId, name, input.displayId ?? null, input.lookId ?? null, input.route, input.enabled === false ? 0 : 1, now);
  return id;
}

export function deleteDesktopOutputConfig(teamId: string, outputId: string) {
  getDesktopDatabase().prepare("DELETE FROM desktop_output_configs WHERE id = ? AND team_id = ?").run(outputId, teamId);
}
