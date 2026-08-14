import { describe, expect, it } from "vitest";
import { materializeTeachingPresentationSlides, type DesktopTeachingPresentation } from "./teaching-presentations";

const deck: DesktopTeachingPresentation = {
  id: "deck",
  name: "Sunday Deck",
  kind: "pptx",
  sizeBytes: 100,
  slides: [{
    id: "slide-a",
    renderedMediaUrl: "/api/desktop/presentation-media/deck/rendered-1.png",
    viewMode: "edited",
    layers: [{ id: "title", kind: "text", name: "Title", x: 0, y: 0, width: 50, height: 20, rotation: 0, text: "Imported" }],
  }],
  report: { importedText: 1, warnings: [] },
};

describe("teaching presentation materialization", () => {
  it("uses the same persisted edited layers for editor and live output", () => {
    expect(materializeTeachingPresentationSlides(deck)[0]).toMatchObject({
      id: "slide-a",
      teachingViewMode: "edited",
      mediaUrl: undefined,
      sceneLayers: [{ text: "Imported" }],
    });
  });

  it("merges a legacy local override without changing exact Original view", () => {
    const override = [{ id: "title", kind: "text" as const, name: "Title", x: 0, y: 0, width: 50, height: 20, rotation: 0, text: "Saved edit" }];
    expect(materializeTeachingPresentationSlides(deck, { "slide-a": override })[0].sceneLayers).toEqual(override);
    expect(materializeTeachingPresentationSlides({ ...deck, slides: [{ ...deck.slides[0], viewMode: "original" }] }, { "slide-a": override })[0]).toMatchObject({
      mediaUrl: deck.slides[0].renderedMediaUrl,
      sceneLayers: [],
    });
  });
});
