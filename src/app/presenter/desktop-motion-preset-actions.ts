"use server";

import type { BlockMotion } from "@/lib/domain/presentation";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { deleteDesktopMotionPreset, saveDesktopMotionPreset } from "@/lib/desktop/motion-presets";

async function desktopTeamId() {
  if (!isDesktopRuntime()) throw new Error("Motion Presets are available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before using Motion Presets.");
  return context.teamId;
}

export async function saveDesktopMotionPresetAction(name: string, motion: BlockMotion) {
  return saveDesktopMotionPreset(await desktopTeamId(), name, motion);
}

export async function deleteDesktopMotionPresetAction(presetId: string) {
  return deleteDesktopMotionPreset(await desktopTeamId(), presetId);
}
