import JSZip from "jszip";
import { posix as pathPosix } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDesktopDatabase, newMutationId, nowIso, withDesktopTransaction } from "@/lib/desktop/db";
import { getDesktopDataDirectory } from "@/lib/desktop/runtime";
import type { PresentationSlide, SceneLayer } from "@/lib/domain/presentation";
import { materializeTeachingPresentationSlides, type DesktopTeachingPresentation } from "@/lib/presentation/teaching-presentations";

export type ImportedPresentation = DesktopTeachingPresentation;

const EDITABLE_LAYER_KINDS = new Set<SceneLayer["kind"]>(["text", "shape", "image", "video", "live-camera", "live-screen"]);
const LOCAL_MEDIA_URL = /^\/api\/desktop\/(?:presentation-media\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9._-]{1,240}|backgrounds\/[a-zA-Z0-9_-]{1,128})(?:\?.*)?$/;
const MAX_PPTX_BYTES = 500 * 1024 * 1024;
const MAX_PPTX_SLIDES = 500;
const MAX_PPTX_MEDIA_FILES = 2_000;
const MAX_PPTX_EXPANDED_BYTES = 1024 * 1024 * 1024;

export function validatePptxArchiveInventory(entries: Array<{ name: string; uncompressedSize: number }>) {
  const slideCount = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).length;
  const mediaCount = entries.filter((entry) => /^ppt\/media\//i.test(entry.name)).length;
  const expandedBytes = entries.reduce((total, entry) => total + Math.max(0, Number(entry.uncompressedSize) || 0), 0);
  if (!slideCount) throw new Error("This file does not contain PowerPoint slides.");
  if (slideCount > MAX_PPTX_SLIDES) throw new Error(`PowerPoint files are limited to ${MAX_PPTX_SLIDES} slides.`);
  if (mediaCount > MAX_PPTX_MEDIA_FILES) throw new Error("This PowerPoint contains too many embedded media files.");
  if (expandedBytes > MAX_PPTX_EXPANDED_BYTES) throw new Error("This PowerPoint expands beyond the 1 GB safety limit.");
}

function validatePresentationId(value: string, label: string) {
  if (!/^[a-zA-Z0-9_-]{1,320}$/.test(value)) throw new Error(`${label} is invalid.`);
}

/** Validate the desktop-only editing payload before it reaches SQLite or an output window. */
export function validateImportedSceneLayers(layers: SceneLayer[]) {
  if (!Array.isArray(layers)) throw new Error("PowerPoint layers are invalid.");
  if (layers.length > 2_000) throw new Error("This slide has too many editable layers.");
  const ids = new Set<string>();
  for (const layer of layers) {
    if (!layer || typeof layer !== "object" || !EDITABLE_LAYER_KINDS.has(layer.kind)) throw new Error("A PowerPoint layer type is invalid.");
    validatePresentationId(layer.id, "A PowerPoint layer");
    if (ids.has(layer.id)) throw new Error("PowerPoint layer IDs must be unique.");
    ids.add(layer.id);
    if (typeof layer.name !== "string" || !layer.name.trim() || layer.name.length > 80) throw new Error("A PowerPoint layer name is invalid.");
    if (![layer.x, layer.y, layer.width, layer.height, layer.rotation].every(Number.isFinite)) throw new Error("A PowerPoint layer position is invalid.");
    if (layer.x < 0 || layer.y < 0 || layer.x > 100 || layer.y > 100 || layer.width < 1 || layer.height < 1 || layer.width > 100 || layer.height > 100) {
      throw new Error("A PowerPoint layer position or size is outside the slide.");
    }
    if (Math.abs(layer.rotation) > 3_600) throw new Error("A PowerPoint layer rotation is invalid.");
    if (layer.text !== undefined && (typeof layer.text !== "string" || layer.text.length > 100_000)) throw new Error("PowerPoint layer text is too long.");
    if (layer.fontSize !== undefined && (!Number.isFinite(layer.fontSize) || layer.fontSize < 1 || layer.fontSize > 2_000)) throw new Error("A PowerPoint font size is invalid.");
    if (layer.fontFamily !== undefined && (typeof layer.fontFamily !== "string" || layer.fontFamily.length > 120)) throw new Error("A PowerPoint font family is invalid.");
    if (layer.opacity !== undefined && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new Error("A PowerPoint layer opacity is invalid.");
    if (layer.borderWidth !== undefined && (!Number.isFinite(layer.borderWidth) || layer.borderWidth < 0 || layer.borderWidth > 100)) throw new Error("A PowerPoint layer border is invalid.");
    if (layer.mediaUrl && !LOCAL_MEDIA_URL.test(layer.mediaUrl)) throw new Error("PowerPoint layer media must come from this PC's managed library.");
    for (const color of [layer.color, layer.backgroundColor, layer.borderColor]) {
      if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("A PowerPoint layer color is invalid.");
    }
  }
  return layers;
}

export function cleanImportedPresentationName(value: string) {
  const name = value.trim().replace(/\.(?:pptx|pdf)$/i, "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("A presentation name is required.");
  return name;
}

async function loadServerPdfJs() {
  // PDF.js treats Electron utility processes as browser processes, so install
  // its Node canvas globals before loading it. The delayed import also keeps
  // PDF.js out of the Presenter's normal server startup path.
  const globals = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    ImageData?: typeof ImageData;
    Path2D?: typeof Path2D;
  };
  if (!globals.DOMMatrix || !globals.ImageData || !globals.Path2D) {
    const canvas = await import("@napi-rs/canvas");
    globals.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix;
    globals.ImageData ??= canvas.ImageData as unknown as typeof ImageData;
    globals.Path2D ??= canvas.Path2D as unknown as typeof Path2D;
  }
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

/** Convert persisted desktop-only PPTX records back into editable presenter slides. */
export function importedPresentationSlides(presentation: ImportedPresentation): PresentationSlide[] {
  return materializeTeachingPresentationSlides(presentation);
}

export function listImportedPresentations(teamId: string, setlistId?: string): ImportedPresentation[] {
  const rows = (setlistId
    ? getDesktopDatabase().prepare(`
        SELECT p.id, p.name, p.source_kind, p.size_bytes, p.presentation_json, p.report_json
        FROM desktop_imported_presentations p
        INNER JOIN desktop_setlist_presentations sp ON sp.presentation_id = p.id AND sp.team_id = p.team_id
        WHERE p.team_id = ? AND sp.setlist_id = ?
        ORDER BY sp.position, sp.created_at DESC
      `).all(teamId, setlistId)
    : getDesktopDatabase().prepare(`
        SELECT id, name, source_kind, size_bytes, presentation_json, report_json
        FROM desktop_imported_presentations
        WHERE team_id = ?
        ORDER BY created_at DESC
      `).all(teamId)) as Array<{
        id: string;
        name: string;
        source_kind: "pptx" | "pdf";
        size_bytes: number;
        presentation_json: string;
        report_json: string;
      }>;
  return rows.flatMap((row) => {
    try {
      const slides = JSON.parse(row.presentation_json);
      const report = JSON.parse(row.report_json);
      return Array.isArray(slides) && report && typeof report === "object"
        ? [{ id: row.id, name: row.name, kind: row.source_kind || "pptx", sizeBytes: row.size_bytes || 0, slides, report }]
        : [];
    } catch { return []; }
  });
}

function getImportedPresentation(teamId: string, presentationId: string): ImportedPresentation {
  validatePresentationId(presentationId, "The imported presentation");
  const row = getDesktopDatabase().prepare(`
    SELECT id, name, source_kind, size_bytes, presentation_json, report_json
    FROM desktop_imported_presentations
    WHERE id = ? AND team_id = ?
  `).get(presentationId, teamId) as {
    id: string;
    name: string;
    source_kind: "pptx" | "pdf";
    size_bytes: number;
    presentation_json: string;
    report_json: string;
  } | undefined;
  if (!row) throw new Error("The imported presentation was not found.");
  try {
    const slides = JSON.parse(row.presentation_json);
    const report = JSON.parse(row.report_json);
    if (!Array.isArray(slides) || !report || typeof report !== "object") throw new Error("invalid presentation data");
    return { id: row.id, name: row.name, kind: row.source_kind || "pptx", sizeBytes: row.size_bytes || 0, slides, report };
  } catch {
    throw new Error("The imported presentation data is damaged.");
  }
}

function replaceImportedPresentationSlides(teamId: string, presentationId: string, slides: ImportedPresentation["slides"]) {
  if (!slides.length) throw new Error("A presentation must keep at least one slide.");
  const result = getDesktopDatabase().prepare(`
    UPDATE desktop_imported_presentations
    SET presentation_json = ?
    WHERE id = ? AND team_id = ?
  `).run(JSON.stringify(slides), presentationId, teamId);
  if (!result.changes) throw new Error("The imported presentation was not found.");
  return getImportedPresentation(teamId, presentationId);
}

/** Store the editable slide itself so editor, Remote, projector, and restart recovery use one source. */
export function saveImportedPresentationSlideLayers(
  teamId: string,
  presentationId: string,
  slideId: string,
  layers: SceneLayer[],
) {
  validatePresentationId(slideId, "The PowerPoint slide");
  validateImportedSceneLayers(layers);
  const presentation = getImportedPresentation(teamId, presentationId);
  const index = presentation.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new Error("The PowerPoint slide was not found.");
  presentation.slides[index] = { ...presentation.slides[index], layers, viewMode: "edited" };
  const saved = replaceImportedPresentationSlides(teamId, presentationId, presentation.slides);
  // Older releases kept PPTX edits in the generic setlist scene-layer table.
  // Once the deck owns the edit, remove that stale override so it cannot win
  // again after restarting the app.
  getDesktopDatabase().prepare("DELETE FROM desktop_scene_layer_slides WHERE team_id = ? AND slide_id = ?").run(teamId, slideId);
  return saved;
}

export function addImportedPresentationSlide(teamId: string, presentationId: string, afterSlideId?: string) {
  const presentation = getImportedPresentation(teamId, presentationId);
  const slide = { id: `pptx-${newMutationId()}`, layers: [] as SceneLayer[], viewMode: "edited" as const };
  const afterIndex = afterSlideId ? presentation.slides.findIndex((candidate) => candidate.id === afterSlideId) : presentation.slides.length - 1;
  if (afterSlideId && afterIndex < 0) throw new Error("The PowerPoint slide was not found.");
  presentation.slides.splice(afterIndex + 1, 0, slide);
  return replaceImportedPresentationSlides(teamId, presentationId, presentation.slides);
}

export function duplicateImportedPresentationSlide(teamId: string, presentationId: string, slideId: string) {
  const presentation = getImportedPresentation(teamId, presentationId);
  const index = presentation.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new Error("The PowerPoint slide was not found.");
  const original = presentation.slides[index];
  const duplicate = {
    ...original,
    id: `pptx-${newMutationId()}`,
    viewMode: "edited" as const,
    layers: original.layers.map((layer) => ({ ...layer, id: newMutationId(), name: `${layer.name} copy`.slice(0, 80) })),
  };
  presentation.slides.splice(index + 1, 0, duplicate);
  return replaceImportedPresentationSlides(teamId, presentationId, presentation.slides);
}

export function deleteImportedPresentationSlide(teamId: string, presentationId: string, slideId: string) {
  const presentation = getImportedPresentation(teamId, presentationId);
  if (presentation.slides.length <= 1) throw new Error("A presentation must keep at least one slide.");
  const nextSlides = presentation.slides.filter((slide) => slide.id !== slideId);
  if (nextSlides.length === presentation.slides.length) throw new Error("The PowerPoint slide was not found.");
  return withDesktopTransaction((db) => {
    const result = db.prepare(`UPDATE desktop_imported_presentations SET presentation_json = ? WHERE id = ? AND team_id = ?`)
      .run(JSON.stringify(nextSlides), presentationId, teamId);
    if (!result.changes) throw new Error("The imported presentation was not found.");
    db.prepare("DELETE FROM desktop_scene_layer_slides WHERE team_id = ? AND slide_id = ?").run(teamId, slideId);
    return getImportedPresentation(teamId, presentationId);
  });
}

export function reorderImportedPresentationSlides(teamId: string, presentationId: string, orderedSlideIds: string[]) {
  const presentation = getImportedPresentation(teamId, presentationId);
  if (orderedSlideIds.length !== presentation.slides.length || new Set(orderedSlideIds).size !== orderedSlideIds.length) {
    throw new Error("The PowerPoint slide order is incomplete.");
  }
  const byId = new Map(presentation.slides.map((slide) => [slide.id, slide]));
  const ordered = orderedSlideIds.map((id) => byId.get(id));
  if (ordered.some((slide) => !slide)) throw new Error("The PowerPoint slide order is invalid.");
  return replaceImportedPresentationSlides(teamId, presentationId, ordered as ImportedPresentation["slides"]);
}

export function renameImportedPresentation(teamId: string, presentationId: string, name: string) {
  const result = getDesktopDatabase().prepare("UPDATE desktop_imported_presentations SET name = ? WHERE id = ? AND team_id = ?").run(cleanImportedPresentationName(name), presentationId, teamId);
  if (!result.changes) throw new Error("Imported presentation was not found.");
}

export function setImportedPresentationSlideViewMode(
  teamId: string,
  presentationId: string,
  slideId: string,
  viewMode: "original" | "edited",
) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(presentationId) || !/^[a-zA-Z0-9_-]{1,320}$/.test(slideId)) {
    throw new Error("The Teaching slide is invalid.");
  }
  const db = getDesktopDatabase();
  const row = db.prepare(`
    SELECT presentation_json
    FROM desktop_imported_presentations
    WHERE id = ? AND team_id = ? AND source_kind = 'pptx'
  `).get(presentationId, teamId) as { presentation_json?: string } | undefined;
  if (!row?.presentation_json) throw new Error("The PowerPoint presentation was not found.");
  const slides = JSON.parse(row.presentation_json) as ImportedPresentation["slides"];
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0 || !slides[index].renderedMediaUrl) throw new Error("An original PowerPoint rendering is unavailable for this slide.");
  slides[index] = { ...slides[index], viewMode };
  db.prepare(`
    UPDATE desktop_imported_presentations
    SET presentation_json = ?
    WHERE id = ? AND team_id = ?
  `).run(JSON.stringify(slides), presentationId, teamId);
  return slides[index];
}

export function deleteImportedPresentation(teamId: string, setlistId: string, presentationId: string) {
  const removed = withDesktopTransaction((db) => {
    const row = db.prepare("SELECT presentation_json FROM desktop_imported_presentations WHERE id = ? AND team_id = ?").get(presentationId, teamId) as { presentation_json?: string } | undefined;
    const association = db.prepare(`
      DELETE FROM desktop_setlist_presentations
      WHERE team_id = ? AND setlist_id = ? AND presentation_id = ?
    `).run(teamId, setlistId, presentationId);
    if (!association.changes) return false;
    try {
      const slides = JSON.parse(row?.presentation_json || "[]") as Array<{ id?: unknown }>;
      const deleteLegacyLayer = db.prepare("DELETE FROM desktop_scene_layer_slides WHERE team_id = ? AND setlist_id = ? AND slide_id = ?");
      for (const slide of slides) if (typeof slide.id === "string") deleteLegacyLayer.run(teamId, setlistId, slide.id);
    } catch {
      // A damaged deck can still be safely removed from the selected setlist.
    }
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM desktop_setlist_presentations WHERE presentation_id = ?").get(presentationId) as { count: number };
    if (Number(remaining.count) > 0) return false;
    db.prepare("DELETE FROM desktop_imported_presentations WHERE id = ? AND team_id = ?").run(presentationId, teamId);
    return true;
  });
  if (removed && /^[a-zA-Z0-9_-]{1,128}$/.test(presentationId)) {
    rmSync(join(getDesktopDataDirectory(), "presentation-media", presentationId), { recursive: true, force: true });
  }
}

function decodeXml(value: string) { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }

const SLIDE_WIDTH = 12_192_000;
const SLIDE_HEIGHT = 6_858_000;

function numericAttribute(xml: string, name: string) {
  const match = new RegExp(`\\b${name}="(-?\\d+)"`).exec(xml);
  return match ? Number(match[1]) : 0;
}

function geometry(xml: string) {
  const off = /<a:off\b[^>]*\/>/.exec(xml)?.[0] || "";
  const ext = /<a:ext\b[^>]*\/>/.exec(xml)?.[0] || "";
  return {
    x: Math.max(0, Math.min(100, numericAttribute(off, "x") / SLIDE_WIDTH * 100)),
    y: Math.max(0, Math.min(100, numericAttribute(off, "y") / SLIDE_HEIGHT * 100)),
    width: Math.max(1, Math.min(100, numericAttribute(ext, "cx") / SLIDE_WIDTH * 100 || 20)),
    height: Math.max(1, Math.min(100, numericAttribute(ext, "cy") / SLIDE_HEIGHT * 100 || 12)),
    rotation: Math.round(numericAttribute(/<a:xfrm\b[^>]*>/.exec(xml)?.[0] || "", "rot") / 60000),
  };
}

function srgbColor(xml: string, fallback: string) {
  const value = /<a:srgbClr\b[^>]*\bval="([0-9a-f]{6})"/i.exec(xml)?.[1];
  return value ? `#${value.toUpperCase()}` : fallback;
}

function editableShapeText(xml: string) {
  const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((paragraph) => {
    const tokens = [...paragraph[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)];
    return tokens.map((token) => token[1] === undefined ? "\n" : decodeXml(token[1])).join("").trimEnd();
  });
  return paragraphs.join("\n").trim();
}

/** PPTX siblings draw in document order: later visual nodes appear in front. */
function visualLayerZIndex(slideXml: string, sourceOffset: number) {
  return [...slideXml.matchAll(/<p:(?:sp|pic)\b/g)].filter((match) => (match.index ?? 0) < sourceOffset).length;
}

/** Parse editable text and basic filled shapes from a PPTX slide XML part. */
export function parsePptxSlideXml(xml: string): SceneLayer[] {
  const shapes = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)];
  const groups = [...xml.matchAll(/<p:grpSp\b[\s\S]*?<\/p:grpSp>/g)].map((match) => ({ xml: match[0], id: newMutationId() }));
  return shapes.map((shape, index): SceneLayer | null => {
    const fragment = shape[0];
    const text = editableShapeText(fragment);
    const position = geometry(fragment);
    const color = srgbColor(fragment, text ? "#ffffff" : "#6d28d9");
    const fontSizeRaw = /<a:rPr\b[^>]*\bsz="(\d+)"/i.exec(fragment)?.[1];
    const runProperties = /<a:rPr\b[^>]*>/i.exec(fragment)?.[0] || "";
    const fontFamily = /<a:latin\b[^>]*\btypeface="([^"]+)"/i.exec(fragment)?.[1];
    const alignment = /<a:pPr\b[^>]*\balgn="([^"]+)"/i.exec(fragment)?.[1]?.toLowerCase();
    const textAlign = alignment === "ctr" ? "center" : alignment === "r" ? "right" : "left";
    const groupId = groups.find((group) => group.xml.includes(fragment))?.id;
    const zIndex = visualLayerZIndex(xml, shape.index ?? 0);
    if (text) return {
      id: newMutationId(), kind: "text", name: `Text ${index + 1}`, ...position, zIndex, groupId, text, color,
      fontFamily: fontFamily ? decodeXml(fontFamily) : undefined,
      fontSize: fontSizeRaw ? Math.max(8, Math.round(Number(fontSizeRaw) / 100)) : 56,
      bold: /\bb="(?:1|true)"/i.test(runProperties),
      italic: /\bi="(?:1|true)"/i.test(runProperties),
      underline: /\bu="(?!none)[^"]+"/i.test(runProperties),
      textAlign,
    };
    if (/<a:solidFill\b/i.test(fragment)) {
      const preset = /<a:prstGeom\b[^>]*\bprst="([^"]+)"/i.exec(fragment)?.[1]?.toLowerCase();
      const shapeType = preset === "ellipse" ? "ellipse" : preset === "triangle" ? "triangle" : "rectangle";
      return { id: newMutationId(), kind: "shape", name: `Shape ${index + 1}`, ...position, zIndex, groupId, backgroundColor: color, borderRadius: 0, shapeType };
    }
    return null;
  }).filter((layer): layer is SceneLayer => layer !== null);
}

export function parsePptxPictureXml(xml: string, index: number, zIndex = index) {
  const relationshipId = /<a:blip\b[^>]*\br:embed="([^"]+)"/i.exec(xml)?.[1]
    ?? /<p:videoFile\b[^>]*\br:link="([^"]+)"/i.exec(xml)?.[1];
  if (!relationshipId) return null;
  return { relationshipId, layer: { id: newMutationId(), kind: "image" as const, name: `Image ${index + 1}`, ...geometry(xml), zIndex } };
}

function importedMediaUrl(presentationId: string, filename: string) {
  return `/api/desktop/presentation-media/${encodeURIComponent(presentationId)}/${encodeURIComponent(filename)}`;
}

function relationshipTargets(xml: string) {
  return new Map([...xml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gi)].map((match) => [match[1], match[2]]));
}

function contentTypeForPresentationMedia(file: string) {
  const extension = file.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm" } as Record<string, string | undefined>)[extension || ""];
}

function renderPowerPointSlides(
  sourcePath: string,
  mediaDirectory: string,
  presentationId: string,
  slideCount: number,
) {
  if (process.platform !== "win32" || (process.env.NODE_ENV === "test" && process.env.ANW_TEST_POWERPOINT_RENDER !== "1")) {
    return [] as string[];
  }
  const script = String.raw`
$sourcePath = $env:ANW_POWERPOINT_SOURCE_PATH
$outputDirectory = $env:ANW_POWERPOINT_OUTPUT_DIRECTORY
$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open($sourcePath, $true, $true, $false)
  $width = 1920
  $height = [Math]::Max(1, [int][Math]::Round($width * $presentation.PageSetup.SlideHeight / $presentation.PageSetup.SlideWidth))
  for ($index = 1; $index -le $presentation.Slides.Count; $index++) {
    $target = Join-Path $outputDirectory ("rendered-{0}.png" -f $index)
    $presentation.Slides.Item($index).Export($target, "PNG", $width, $height)
  }
} finally {
  if ($presentation -ne $null) {
    $presentation.Close()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
  }
  if ($powerPoint -ne $null) {
    $powerPoint.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  execFileSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedScript,
  ], {
    env: {
      ...process.env,
      ANW_POWERPOINT_SOURCE_PATH: sourcePath,
      ANW_POWERPOINT_OUTPUT_DIRECTORY: mediaDirectory,
    },
    windowsHide: true,
    timeout: 5 * 60 * 1000,
    stdio: "pipe",
  });
  return Array.from({ length: slideCount }, (_, index) => {
    const filename = `rendered-${index + 1}.png`;
    return existsSync(join(mediaDirectory, filename)) ? importedMediaUrl(presentationId, filename) : "";
  });
}

function saveImportedPresentation(teamId: string, setlistId: string, sourceFile: string, imported: ImportedPresentation) {
  withDesktopTransaction((db) => {
    db.prepare(`
      INSERT INTO desktop_imported_presentations
        (id, team_id, name, source_kind, source_file, size_bytes, presentation_json, report_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      imported.id,
      teamId,
      imported.name,
      imported.kind,
      sourceFile.slice(0, 240),
      imported.sizeBytes,
      JSON.stringify(imported.slides),
      JSON.stringify(imported.report),
      nowIso(),
    );
    db.prepare(`
      INSERT INTO desktop_setlist_presentations
        (team_id, setlist_id, presentation_id, position, created_at)
      VALUES (?, ?, ?, COALESCE((
        SELECT MAX(position) + 1 FROM desktop_setlist_presentations WHERE team_id = ? AND setlist_id = ?
      ), 0), ?)
    `).run(teamId, setlistId, imported.id, teamId, setlistId, nowIso());
  });
}

export async function importPptx(teamId: string, setlistId: string, name: string, bytes: ArrayBuffer): Promise<ImportedPresentation> {
  if (!bytes.byteLength || bytes.byteLength > MAX_PPTX_BYTES) throw new Error("PowerPoint files must be smaller than 500 MB.");
  const zip = await JSZip.loadAsync(new Uint8Array(bytes));
  validatePptxArchiveInventory(Object.values(zip.files).map((entry) => ({
    name: entry.name,
    uncompressedSize: Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0),
  })));
  const presentationId = newMutationId();
  const mediaDirectory = join(getDesktopDataDirectory(), "presentation-media", presentationId);
  mkdirSync(mediaDirectory, { recursive: true });
  try {
  const slideFiles = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const warnings: string[] = [];
  const sourcePath = join(mediaDirectory, "source.pptx");
  writeFileSync(sourcePath, Buffer.from(bytes));
  let renderedSlides: string[] = [];
  try {
    renderedSlides = renderPowerPointSlides(sourcePath, mediaDirectory, presentationId, slideFiles.length);
  } catch (error) {
    const details = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr || "").replace(/\s+/g, " ").trim().slice(0, 240)
      : "";
    warnings.push(`Exact PowerPoint previews are unavailable. Install Microsoft PowerPoint and re-import this file; editable layers are still available.${details ? ` (${details})` : ""}`);
  }
  let importedText = 0;
  let expandedReadBytes = 0;
  const slides = [] as ImportedPresentation["slides"];
  for (const [slideIndex, file] of slideFiles.entries()) {
    const xml = await zip.file(file)!.async("string");
    expandedReadBytes += Buffer.byteLength(xml);
    if (expandedReadBytes > MAX_PPTX_EXPANDED_BYTES) throw new Error("This PowerPoint expands beyond the 1 GB safety limit.");
    const layers = parsePptxSlideXml(xml);
    const relationshipFile = file.replace(/ppt\/slides\/([^/]+)\.xml$/i, "ppt/slides/_rels/$1.xml.rels");
    const relationships = zip.file(relationshipFile) ? relationshipTargets(await zip.file(relationshipFile)!.async("string")) : new Map<string, string>();
    const pictures = [...xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)];
    for (const [pictureIndex, match] of pictures.entries()) {
      const picture = parsePptxPictureXml(match[0], pictureIndex, visualLayerZIndex(xml, match.index ?? 0));
      const target = picture && relationships.get(picture.relationshipId);
      if (!picture || !target) { warnings.push(`Slide ${slideIndex + 1}: an image relationship could not be resolved.`); continue; }
      const mediaPath = pathPosix.normalize(pathPosix.join(pathPosix.dirname(file), target));
      const mediaFile = zip.file(mediaPath);
      const contentType = contentTypeForPresentationMedia(mediaPath);
      if (!mediaFile || !contentType) { warnings.push(`Slide ${slideIndex + 1}: unsupported media needs manual replacement.`); continue; }
      const bytes = await mediaFile.async("nodebuffer");
      expandedReadBytes += bytes.byteLength;
      if (expandedReadBytes > MAX_PPTX_EXPANDED_BYTES) throw new Error("This PowerPoint expands beyond the 1 GB safety limit.");
      const filename = `${pictureIndex}-${pathPosix.basename(mediaPath).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      writeFileSync(join(mediaDirectory, filename), bytes);
      layers.push({ ...picture.layer, kind: contentType.startsWith("video/") ? "video" : "image", name: pathPosix.basename(mediaPath), mediaUrl: importedMediaUrl(presentationId, filename) });
    }
    importedText += layers.filter((layer) => layer.kind === "text").length;
    if (/<c:chart|a:tbl|dgm:|p:oleObj|p:timing|p:transition/i.test(xml)) warnings.push(`Slide ${slideIndex + 1}: charts, tables, SmartArt, OLE objects, or advanced animations need manual recreation.`);
    slides.push({
      id: `pptx-${newMutationId()}`,
      layers,
      renderedMediaUrl: renderedSlides[slideIndex] || undefined,
      viewMode: renderedSlides[slideIndex] ? "original" : "edited",
    });
  }
  const imported: ImportedPresentation = {
    id: presentationId,
    name: cleanImportedPresentationName(name || "Imported presentation"),
    kind: "pptx",
    sizeBytes: bytes.byteLength,
    slides,
    report: { importedText, warnings },
  };
  saveImportedPresentation(teamId, setlistId, name, imported);
  return imported;
  } catch (error) {
    rmSync(mediaDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function importPdf(teamId: string, setlistId: string, name: string, bytes: ArrayBuffer): Promise<ImportedPresentation> {
  const presentationId = newMutationId();
  const mediaDirectory = join(getDesktopDataDirectory(), "presentation-media", presentationId);
  mkdirSync(mediaDirectory, { recursive: true });
  const filename = "document.pdf";
  const mediaUrl = importedMediaUrl(presentationId, filename);
  writeFileSync(join(mediaDirectory, filename), Buffer.from(bytes));
  const { getDocument } = await loadServerPdfJs();
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const document = await loadingTask.promise;
    if (!document.numPages || document.numPages > 500) {
      throw new Error(document.numPages > 500 ? "PDF files are limited to 500 pages." : "This PDF has no pages.");
    }
    const slides: ImportedPresentation["slides"] = [];
    let importedText = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const preview = textContent.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      if (preview) importedText += 1;
      slides.push({
        id: `pdf-${presentationId}-${pageNumber}`,
        layers: [],
        mediaUrl,
        pdfPage: pageNumber,
        preview,
      });
      page.cleanup();
    }
    const imported: ImportedPresentation = {
      id: presentationId,
      name: cleanImportedPresentationName(name || "Imported PDF"),
      kind: "pdf",
      sizeBytes: bytes.byteLength,
      slides,
      report: { importedText, warnings: [] },
    };
    saveImportedPresentation(teamId, setlistId, name, imported);
    return imported;
  } catch (error) {
    rmSync(mediaDirectory, { recursive: true, force: true });
    throw error instanceof Error ? error : new Error("This PDF could not be read. It may be damaged or password protected.");
  } finally {
    await loadingTask.destroy();
  }
}

export async function importTeachingFile(teamId: string, setlistId: string, name: string, bytes: ArrayBuffer) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pptx") return importPptx(teamId, setlistId, name, bytes);
  if (extension === "pdf") return importPdf(teamId, setlistId, name, bytes);
  throw new Error("Choose a PDF or PowerPoint .pptx file.");
}
