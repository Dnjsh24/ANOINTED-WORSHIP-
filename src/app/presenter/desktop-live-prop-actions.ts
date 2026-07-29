"use server";

import type { LiveProp } from "@/lib/domain/presentation";
import { deleteDesktopLivePropPreset, saveDesktopLivePropPreset } from "@/lib/desktop/live-props";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

async function teamId() {
  if (!isDesktopRuntime()) throw new Error("Prop presets are available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before saving a prop preset.");
  return context.teamId;
}

export async function saveDesktopLivePropPresetAction(name: string, prop: LiveProp) { return saveDesktopLivePropPreset(await teamId(), name, prop); }
export async function deleteDesktopLivePropPresetAction(id: string) { return deleteDesktopLivePropPreset(await teamId(), id); }
