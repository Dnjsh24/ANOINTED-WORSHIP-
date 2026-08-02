import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { getDesktopDatabase } from "./db";
import { listDesktopLyricShortcuts, setDesktopLyricShortcut } from "./lyric-shortcuts";
import { cleanImportedPresentationName, deleteImportedPresentation, importPdf, importPptx, importedPresentationSlides, listImportedPresentations, parsePptxPictureXml, parsePptxSlideXml, setImportedPresentationSlideViewMode } from "./pptx-import";

function onePagePdf() {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 720 Td (Teaching PDF) Tj ET\nendstream\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

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
    expect(importedPresentationSlides({ id: "presentation", name: "Sunday Deck", kind: "pptx", sizeBytes: 100, slides: [{ id: "slide-a", layers: [{ id: "layer", kind: "text", name: "Title", x: 0, y: 0, width: 30, height: 10, rotation: 0, text: "Welcome" }] }], report: { importedText: 1, warnings: [] } })).toMatchObject([
      { id: "slide-a", type: "teaching", sectionLabel: "Sunday Deck", sceneLayers: [{ text: "Welcome" }] },
    ]);
  });

  it("shows the exact PowerPoint rendering by default and keeps editable layers available", () => {
    const presentation = {
      id: "presentation",
      name: "Sunday Deck",
      kind: "pptx" as const,
      sizeBytes: 100,
      slides: [{
        id: "slide-a",
        renderedMediaUrl: "/api/desktop/presentation-media/presentation/rendered-1.png",
        layers: [{ id: "layer", kind: "text" as const, name: "Title", x: 0, y: 0, width: 30, height: 10, rotation: 0, text: "Welcome" }],
      }],
      report: { importedText: 1, warnings: [] },
    };

    expect(importedPresentationSlides(presentation)).toMatchObject([{
      id: "slide-a",
      mediaUrl: "/api/desktop/presentation-media/presentation/rendered-1.png",
      teachingViewMode: "original",
      sceneLayers: [],
    }]);
    expect(importedPresentationSlides({
      ...presentation,
      slides: [{ ...presentation.slides[0], viewMode: "edited" as const }],
    })).toMatchObject([{
      id: "slide-a",
      teachingViewMode: "edited",
      sceneLayers: [{ text: "Welcome" }],
    }]);
  });

  it("persists Original and Edit view choices for a rendered PowerPoint slide", () => {
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = mkdtempSync(join(tmpdir(), "anw-pptx-view-"));
    const db = getDesktopDatabase();
    db.prepare(`
      INSERT INTO desktop_imported_presentations
        (id, team_id, name, source_kind, source_file, size_bytes, presentation_json, report_json, created_at)
      VALUES ('deck-view', 'team-1', 'Sunday Deck', 'pptx', 'Sunday.pptx', 100, ?, '{"importedText":1,"warnings":[]}', '2026-07-29T00:00:00.000Z')
    `).run(JSON.stringify([{
      id: "slide-a",
      renderedMediaUrl: "/api/desktop/presentation-media/deck-view/rendered-1.png",
      viewMode: "original",
      layers: [],
    }]));

    setImportedPresentationSlideViewMode("team-1", "deck-view", "slide-a", "edited");
    expect(listImportedPresentations("team-1")[0].slides[0]).toMatchObject({ id: "slide-a", viewMode: "edited" });
    setImportedPresentationSlideViewMode("team-1", "deck-view", "slide-a", "original");
    expect(listImportedPresentations("team-1")[0].slides[0]).toMatchObject({ id: "slide-a", viewMode: "original" });
  });

  it.skipIf(process.env.ANW_TEST_POWERPOINT_RENDER !== "1")("renders an exact PowerPoint slide image through Microsoft PowerPoint", async () => {
    const sourcePath = process.env.ANW_TEST_POWERPOINT_SOURCE;
    if (!sourcePath) throw new Error("ANW_TEST_POWERPOINT_SOURCE is required.");
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = mkdtempSync(join(tmpdir(), "anw-pptx-render-"));
    getDesktopDatabase().prepare(`
      INSERT INTO local_setlists
        (id, team_id, name, setlist_date, service_times, presentation_settings, sync_revision, updated_at)
      VALUES ('render-setlist', 'team-1', 'Sunday', '2026-07-29', '[]', '{}', 0, '2026-07-29T00:00:00.000Z')
    `).run();
    const source = readFileSync(sourcePath);
    const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
    const imported = await importPptx("team-1", "render-setlist", "PowerPoint render test.pptx", bytes);

    if (!imported.slides[0]?.renderedMediaUrl) throw new Error(imported.report.warnings.join("\n"));
    expect(imported.slides[0], imported.report.warnings.join("\n")).toMatchObject({
      renderedMediaUrl: expect.stringContaining("rendered-1.png"),
      viewMode: "original",
    });
    expect(existsSync(join(process.env.ANW_DESKTOP_DATA_DIR, "presentation-media", imported.id, "rendered-1.png"))).toBe(true);
  }, 120_000);

  it("keeps imported presentation names bounded and local-friendly", () => {
    expect(cleanImportedPresentationName("  Sunday   Deck.pptx  ")).toBe("Sunday Deck");
    expect(() => cleanImportedPresentationName("   ")).toThrow("name");
  });

  it("saves PDF pages only with the selected setlist and cleans up the final association", async () => {
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = mkdtempSync(join(tmpdir(), "anw-teaching-"));
    const db = getDesktopDatabase();
    const insertSetlist = db.prepare(`
      INSERT INTO local_setlists
        (id, team_id, name, setlist_date, service_times, presentation_settings, sync_revision, updated_at)
      VALUES (?, 'team-1', ?, '2026-07-29', '[]', '{}', 0, '2026-07-29T00:00:00.000Z')
    `);
    insertSetlist.run("setlist-a", "Sunday");
    insertSetlist.run("setlist-b", "Youth");

    const source = onePagePdf();
    const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
    const imported = await importPdf("team-1", "setlist-a", "Message.pdf", bytes);

    expect(imported).toMatchObject({
      name: "Message",
      kind: "pdf",
      slides: [{ pdfPage: 1, preview: "Teaching PDF" }],
    });
    expect(listImportedPresentations("team-1", "setlist-a")).toHaveLength(1);
    expect(listImportedPresentations("team-1", "setlist-b")).toHaveLength(0);

    deleteImportedPresentation("team-1", "setlist-a", imported.id);
    expect(listImportedPresentations("team-1", "setlist-a")).toHaveLength(0);
  });

  it("persists one unique custom lyric key per song and supports reset", () => {
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = mkdtempSync(join(tmpdir(), "anw-shortcuts-"));
    getDesktopDatabase().prepare(`
      INSERT INTO local_setlists
        (id, team_id, name, setlist_date, service_times, presentation_settings, sync_revision, updated_at)
      VALUES ('setlist-shortcuts', 'team-1', 'Sunday', '2026-07-29', '[]', '{}', 0, '2026-07-29T00:00:00.000Z')
    `).run();

    setDesktopLyricShortcut({ teamId: "team-1", setlistId: "setlist-shortcuts", setlistSongId: "song-1", slideId: "slide-1", keyCode: "Digit7" });
    setDesktopLyricShortcut({ teamId: "team-1", setlistId: "setlist-shortcuts", setlistSongId: "song-1", slideId: "slide-2", keyCode: "Digit7" });
    expect(listDesktopLyricShortcuts("team-1", "setlist-shortcuts")).toEqual([
      { setlistSongId: "song-1", slideId: "slide-2", keyCode: "Digit7" },
    ]);

    setDesktopLyricShortcut({ teamId: "team-1", setlistId: "setlist-shortcuts", setlistSongId: "song-1", slideId: "slide-2" });
    expect(listDesktopLyricShortcuts("team-1", "setlist-shortcuts")).toEqual([]);
  });

  it("associates legacy team-global PowerPoint decks without losing them", () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), "anw-legacy-teaching-"));
    const offlineDirectory = join(dataDirectory, "offline");
    mkdirSync(offlineDirectory, { recursive: true });
    const legacy = new DatabaseSync(join(offlineDirectory, "workspace.sqlite"));
    legacy.exec(`
      CREATE TABLE workspace_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE local_setlists (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, event_id TEXT, name TEXT NOT NULL,
        setlist_date TEXT NOT NULL, location TEXT, call_time TEXT, rehearsal_time TEXT,
        service_times TEXT NOT NULL DEFAULT '[]', notes TEXT, presentation_settings TEXT NOT NULL DEFAULT '{}',
        deleted_at TEXT, sync_revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE desktop_imported_presentations (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL,
        presentation_json TEXT NOT NULL, report_json TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO local_setlists (id, team_id, name, setlist_date, updated_at)
        VALUES ('legacy-setlist', 'team-legacy', 'Legacy Sunday', '2026-07-26', '2026-07-26T00:00:00.000Z');
      INSERT INTO desktop_imported_presentations
        (id, team_id, name, presentation_json, report_json, created_at)
        VALUES ('legacy-deck', 'team-legacy', 'Legacy Deck', '[]', '{"importedText":0,"warnings":[]}', '2026-07-26T00:00:00.000Z');
    `);
    legacy.close();
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = dataDirectory;

    expect(listImportedPresentations("team-legacy", "legacy-setlist")).toEqual([
      expect.objectContaining({ id: "legacy-deck", name: "Legacy Deck", kind: "pptx" }),
    ]);
  });
});
