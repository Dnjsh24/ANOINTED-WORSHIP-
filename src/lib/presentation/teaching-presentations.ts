import type { PresentationSlide, SceneLayer } from "@/lib/domain/presentation";

export type DesktopTeachingPresentation = {
  id: string;
  name: string;
  kind: "pptx" | "pdf";
  sizeBytes: number;
  slides: Array<{
    id: string;
    layers: SceneLayer[];
    mediaUrl?: string;
    renderedMediaUrl?: string;
    viewMode?: "original" | "edited";
    pdfPage?: number;
    preview?: string;
  }>;
  report: { importedText: number; warnings: string[] };
};

/**
 * Materialize one canonical slide shape for editor preview, Remote commands,
 * projector output, and restart recovery. Legacy scene-layer rows are merged
 * only until the next direct imported-deck save.
 */
export function materializeTeachingPresentationSlides(
  presentation?: DesktopTeachingPresentation,
  legacyLayerOverrides: Record<string, SceneLayer[]> = {},
): PresentationSlide[] {
  if (!presentation) return [];
  return presentation.slides.map((slide) => {
    const originalView = Boolean(slide.renderedMediaUrl && slide.viewMode !== "edited");
    return {
      id: slide.id,
      type: "teaching",
      content: [],
      sectionLabel: slide.pdfPage ? `${presentation.name} - Page ${slide.pdfPage}` : presentation.name,
      sceneLayers: originalView ? [] : legacyLayerOverrides[slide.id] ?? slide.layers,
      mediaUrl: originalView ? slide.renderedMediaUrl : slide.mediaUrl,
      mediaKind: slide.pdfPage ? "pdf-page" : originalView || slide.mediaUrl ? "image" : undefined,
      pdfPage: slide.pdfPage,
      teachingViewMode: slide.renderedMediaUrl ? slide.viewMode || "original" : undefined,
    } satisfies PresentationSlide;
  });
}
