"use server";

import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { setDesktopLyricShortcut } from "@/lib/desktop/lyric-shortcuts";

export async function setDesktopLyricShortcutAction(input: {
  setlistId: string;
  setlistSongId: string;
  slideId: string;
  keyCode?: string;
}) {
  if (!isDesktopRuntime()) throw new Error("Lyric shortcuts are available only through the Windows Presenter.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before editing lyric shortcuts.");
  setDesktopLyricShortcut({ teamId: context.teamId, ...input });
}
