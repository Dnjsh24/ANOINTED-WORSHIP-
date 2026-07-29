"use server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { deleteImportedPresentation, importPptx, renameImportedPresentation } from "@/lib/desktop/pptx-import";

export async function importDesktopPptxAction(file: File) {
  if (!isDesktopRuntime()) throw new Error("PowerPoint import is available only in the Windows app.");
  if (!file.name.toLowerCase().endsWith(".pptx") || file.size > 500 * 1024 * 1024) throw new Error("Choose a PowerPoint .pptx file smaller than 500 MB.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before importing a presentation.");
  return importPptx(context.teamId, file.name, await file.arrayBuffer());
}

async function desktopTeamId() {
  if (!isDesktopRuntime()) throw new Error("PowerPoint imports are available only in the Windows app.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before managing presentations.");
  return context.teamId;
}

export async function renameDesktopPptxAction(presentationId: string, name: string) {
  renameImportedPresentation(await desktopTeamId(), presentationId, name);
}

export async function deleteDesktopPptxAction(presentationId: string) {
  deleteImportedPresentation(await desktopTeamId(), presentationId);
}
