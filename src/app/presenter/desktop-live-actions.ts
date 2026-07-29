"use server";

import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { saveDesktopPresenterLiveState } from "@/lib/desktop/workspace";

export async function persistDesktopPresenterLiveState(setlistId: string, payload: unknown) {
  if (!isDesktopRuntime()) return;
  const context = await getRequiredTeamContext();
  if (!context.teamId) return;
  saveDesktopPresenterLiveState(setlistId, payload);
}
