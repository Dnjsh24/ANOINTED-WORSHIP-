"use server";

import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { saveDesktopPresenterDraft } from "@/lib/desktop/workspace";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export async function savePresenterDraftAction(setlistId: string, presentationSettings: unknown) {
  if (!setlistId || JSON.stringify(presentationSettings ?? {}).length > 2_000_000) {
    throw new Error("The Presenter draft is invalid or too large.");
  }
  const context = await getRequiredTeamContext();
  if (isDesktopRuntime()) {
    saveDesktopPresenterDraft(context.teamId, setlistId, presentationSettings);
    return { saved: true, offline: true };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("setlists")
    .update({ presentation_settings: presentationSettings as never })
    .eq("id", setlistId)
    .eq("team_id", context.teamId);
  if (error) throw new Error(error.message);
  return { saved: true, offline: false };
}
