import type { SceneLayer } from "@/lib/domain/presentation";
import { getDesktopDatabase, nowIso } from "@/lib/desktop/db";

type Row = { slide_id: string; layers_json: string };

function parseLayers(raw: string): SceneLayer[] {
  try {
    const layers = JSON.parse(raw);
    return Array.isArray(layers) ? layers.filter((layer): layer is SceneLayer => layer && typeof layer.id === "string" && ["text", "shape", "image", "video", "live-camera", "live-screen"].includes(layer.kind)) : [];
  } catch { return []; }
}

export function listDesktopSceneLayers(teamId: string, setlistId: string): Record<string, SceneLayer[]> {
  const rows = getDesktopDatabase().prepare("SELECT slide_id, layers_json FROM desktop_scene_layer_slides WHERE team_id = ? AND setlist_id = ?").all(teamId, setlistId) as Row[];
  return Object.fromEntries(rows.map((row) => [row.slide_id, parseLayers(row.layers_json)]));
}

export function saveDesktopSceneLayers(teamId: string, setlistId: string, slideId: string, layers: SceneLayer[]) {
  getDesktopDatabase().prepare(`
    INSERT INTO desktop_scene_layer_slides (team_id, setlist_id, slide_id, layers_json, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(team_id, setlist_id, slide_id) DO UPDATE SET layers_json = excluded.layers_json, updated_at = excluded.updated_at
  `).run(teamId, setlistId, slideId, JSON.stringify(layers), nowIso());
  return listDesktopSceneLayers(teamId, setlistId);
}
