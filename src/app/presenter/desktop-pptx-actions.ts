"use server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import {
  addImportedPresentationSlide,
  deleteImportedPresentationSlide,
  deleteImportedPresentation,
  duplicateImportedPresentationSlide,
  importPptx,
  renameImportedPresentation,
  reorderImportedPresentationSlides,
  saveImportedPresentationSlideLayers,
  setImportedPresentationSlideViewMode,
} from "@/lib/desktop/pptx-import";
import type { SceneLayer } from "@/lib/domain/presentation";
import { listDesktopSetlists } from "@/lib/desktop/workspace";

export async function importDesktopPptxAction(setlistId: string, file: File) {
  if (!isDesktopRuntime()) throw new Error("PowerPoint import is available only in the Windows app.");
  if (!file.name.toLowerCase().endsWith(".pptx") || file.size > 500 * 1024 * 1024) throw new Error("Choose a PowerPoint .pptx file smaller than 500 MB.");
  const context = await getRequiredTeamContext();
  if (!context.teamId) throw new Error("Choose a team before importing a presentation.");
  if (!listDesktopSetlists(context.teamId).some((setlist) => setlist.id === setlistId)) {
    throw new Error("The selected setlist is unavailable.");
  }
  return importPptx(context.teamId, setlistId, file.name, await file.arrayBuffer());
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

export async function deleteDesktopPptxAction(setlistId: string, presentationId: string) {
  deleteImportedPresentation(await desktopTeamId(), setlistId, presentationId);
}

export async function setDesktopPptxSlideViewModeAction(
  presentationId: string,
  slideId: string,
  viewMode: "original" | "edited",
) {
  if (viewMode !== "original" && viewMode !== "edited") throw new Error("Choose Original or Edit view.");
  return setImportedPresentationSlideViewMode(await desktopTeamId(), presentationId, slideId, viewMode);
}

export async function saveDesktopPptxSlideLayersAction(presentationId: string, slideId: string, layers: SceneLayer[]) {
  return saveImportedPresentationSlideLayers(await desktopTeamId(), presentationId, slideId, layers);
}

export async function addDesktopPptxSlideAction(presentationId: string, afterSlideId?: string) {
  return addImportedPresentationSlide(await desktopTeamId(), presentationId, afterSlideId);
}

export async function duplicateDesktopPptxSlideAction(presentationId: string, slideId: string) {
  return duplicateImportedPresentationSlide(await desktopTeamId(), presentationId, slideId);
}

export async function deleteDesktopPptxSlideAction(presentationId: string, slideId: string) {
  return deleteImportedPresentationSlide(await desktopTeamId(), presentationId, slideId);
}

export async function reorderDesktopPptxSlidesAction(presentationId: string, orderedSlideIds: string[]) {
  return reorderImportedPresentationSlides(await desktopTeamId(), presentationId, orderedSlideIds);
}
