"use server";

import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { deleteDesktopAudienceLook, deleteDesktopOutputConfig, saveDesktopAudienceLook, saveDesktopOutputConfig, type DesktopOutputRoute } from "@/lib/desktop/production-layout";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

async function desktopTeamId() {
  if (!isDesktopRuntime()) throw new Error("Production outputs are available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before changing production outputs.");
  return context.teamId;
}

export async function saveDesktopAudienceLookAction(input: { id?: string; name: string; layout?: Record<string, unknown> }) {
  return saveDesktopAudienceLook(await desktopTeamId(), input);
}

export async function deleteDesktopAudienceLookAction(lookId: string) {
  deleteDesktopAudienceLook(await desktopTeamId(), lookId);
}

export async function saveDesktopOutputConfigAction(input: { id?: string; name: string; displayId?: string | null; lookId?: string | null; route: DesktopOutputRoute; enabled?: boolean }) {
  return saveDesktopOutputConfig(await desktopTeamId(), input);
}

export async function deleteDesktopOutputConfigAction(outputId: string) {
  deleteDesktopOutputConfig(await desktopTeamId(), outputId);
}
