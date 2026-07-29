import { describe, expect, it } from "vitest";
import { cleanImportedPresentationName, importedPresentationSlides, parsePptxPictureXml, parsePptxSlideXml } from "./pptx-import";

describe("PowerPoint slide importer", () => {
  it("keeps editable text position, color, and font size", () => {
    const layers = parsePptxSlideXml(`<p:sp><p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="1371600"/></a:xfrm><a:solidFill><a:srgbClr val="FF00AA"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="4200"/><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>`);
    expect(layers[0]).toMatchObject({ kind: "text", text: "Hello", x: 10, y: 10, width: 50, height: 20, color: "#FF00AA", fontSize: 42, zIndex: 0 });
  });

  it("creates an editable shape for a non-text filled PowerPoint shape", () => {
    const layers = parsePptxSlideXml(`<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="685800"/></a:xfrm><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></p:spPr></p:sp>`);
    expect(layers[0]).toMatchObject({ kind: "shape", backgroundColor: "#0000FF", width: 10, height: 10 });
  });

  it("keeps common PowerPoint preset geometry for editable shapes", () => {
    const [layer] = parsePptxSlideXml(`<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="685800"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></p:spPr></p:sp>`);
    expect(layer).toMatchObject({ kind: "shape", shapeType: "ellipse" });
  });

  it("retains picture relationship and layout for local media extraction", () => {
    expect(parsePptxPictureXml(`<p:pic><p:blipFill><a:blip r:embed="rId5"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6096000" cy="3429000"/></a:xfrm></p:spPr></p:pic>`, 0)).toMatchObject({ relationshipId: "rId5", layer: { kind: "image", width: 50, height: 50 } });
  });

  it("preserves a picture's slide stacking order", () => {
    expect(parsePptxPictureXml(`<p:pic><p:blipFill><a:blip r:embed="rId5"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6096000" cy="3429000"/></a:xfrm></p:spPr></p:pic>`, 0, 7)?.layer).toMatchObject({ zIndex: 7 });
  });

  it("resolves an embedded PowerPoint video relationship", () => {
    expect(parsePptxPictureXml(`<p:pic><p:nvPicPr><p:nvPr><p:videoFile r:link="rId9"/></p:nvPr></p:nvPicPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6096000" cy="3429000"/></a:xfrm></p:spPr></p:pic>`, 0)).toMatchObject({ relationshipId: "rId9", layer: { kind: "image" } });
  });

  it("accounts for pictures that appear before an editable shape", () => {
    const [layer] = parsePptxSlideXml(`<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="685800"/></a:xfrm><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></p:spPr></p:sp>`);
    expect(layer).toMatchObject({ kind: "shape", zIndex: 1 });
  });

  it("keeps child layers in an editable PowerPoint group", () => {
    const layers = parsePptxSlideXml(`<p:grpSp><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="685800"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Grouped</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>`);
    expect(layers[0]?.groupId).toBeTruthy();
  });

  it("restores a saved imported presentation as editable presenter slides", () => {
    expect(importedPresentationSlides({ id: "presentation", name: "Sunday Deck", slides: [{ id: "slide-a", layers: [{ id: "layer", kind: "text", name: "Title", x: 0, y: 0, width: 30, height: 10, rotation: 0, text: "Welcome" }] }], report: { importedText: 1, warnings: [] } })).toMatchObject([
      { id: "slide-a", type: "teaching", sectionLabel: "Sunday Deck", sceneLayers: [{ text: "Welcome" }] },
    ]);
  });

  it("keeps imported presentation names bounded and local-friendly", () => {
    expect(cleanImportedPresentationName("  Sunday   Deck.pptx  ")).toBe("Sunday Deck");
    expect(() => cleanImportedPresentationName("   ")).toThrow("name");
  });
});
