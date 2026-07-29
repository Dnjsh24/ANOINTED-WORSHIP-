"use server";

import type { SceneLayer } from "@/lib/domain/presentation";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { saveDesktopSceneLayers } from "@/lib/desktop/scene-layers";

export async function saveDesktopSceneLayersAction(setlistId: string, slideId: string, layers: SceneLayer[]) {
  if (!isDesktopRuntime()) throw new Error("Scene Layers are available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before editing Scene Layers.");
  // Layer count is deliberately not capped. The workstation is responsible for
  // rendering capacity, while this durable local store remains independent of
  // the cloud sync and its payload limits.
  if (layers.some((layer) => !layer.id || !layer.kind || !Number.isFinite(layer.x) || !Number.isFinite(layer.y))) {
    throw new Error("One or more scene layers are invalid.");
  }
  return saveDesktopSceneLayers(context.teamId, setlistId, slideId, layers);
}
