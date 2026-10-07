"use server";

import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { saveDesktopPresenterDraft } from "@/lib/desktop/workspace";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { z } from "zod";

export async function savePresenterDraftAction(setlistId: string, presentationSettings: unknown) {
  if (!setlistId || JSON.stringify(presentationSettings ?? {}).length > 2_000_000) {
    throw new Error("The Presenter draft is invalid or too large.");
  }
  const context = await getRequiredTeamContext();
  if (isDesktopRuntime()) {
    saveDesktopPresenterDraft(context.teamId, setlistId, presentationSettings);
    return { saved: true, offline: true };
  }

  const parsed = z.record(z.string(), z.json()).safeParse(presentationSettings);
  if (!z.string().uuid().safeParse(setlistId).success || !parsed.success) {
    throw new Error("The Presenter draft is invalid or too large.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_setlist_presentation_settings", {
    p_team_id: context.teamId, p_setlist_id: setlistId, p_settings: parsed.data,
  });
  if (error) throw new Error("The Presenter draft could not be saved. Keep your changes and try again.");
  return { saved: true, offline: false };
}
