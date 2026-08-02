import JSZip from "jszip";
import { posix as pathPosix } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDesktopDatabase, newMutationId, nowIso, withDesktopTransaction } from "@/lib/desktop/db";
import { getDesktopDataDirectory } from "@/lib/desktop/runtime";
import type { PresentationSlide, SceneLayer } from "@/lib/domain/presentation";

export type ImportedPresentation = {
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
  return presentation.slides.map((slide) => ({
    id: slide.id,
    type: "teaching",
    content: [],
    sectionLabel: presentation.name,
    sceneLayers: slide.renderedMediaUrl && slide.viewMode !== "edited" ? [] : slide.layers,
    mediaUrl: slide.renderedMediaUrl && slide.viewMode !== "edited" ? slide.renderedMediaUrl : slide.mediaUrl,
    mediaKind: slide.pdfPage ? "pdf-page" : slide.renderedMediaUrl || slide.mediaUrl ? "image" : undefined,
    pdfPage: slide.pdfPage,
    teachingViewMode: slide.renderedMediaUrl ? slide.viewMode || "original" : undefined,
  }));
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
    const association = db.prepare(`
      DELETE FROM desktop_setlist_presentations
      WHERE team_id = ? AND setlist_id = ? AND presentation_id = ?
    `).run(teamId, setlistId, presentationId);
    if (!association.changes) return false;
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM desktop_setlist_presentations WHERE presentation_id = ?").get(presentationId) as { count: number };
    if (Number(remaining.count) > 0) return false;
    db.prepare("DELETE FROM desktop_imported_presentations WHERE id = ? AND team_id = ?").run(presentationId, teamId);
    return true;
  });
  if (removed && /^[a-zA-Z0-9_-]{1,128}$/.test(presentationId)) {
    rmSync(join(getDesktopDataDirectory(), "presentation-media", presentationId), { recursive: true, force: true });
  }
}

function decodeXml(value: string) { return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'); }

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
    const text = [...fragment.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join(" ").trim();
    const position = geometry(fragment);
    const color = srgbColor(fragment, text ? "#ffffff" : "#6d28d9");
    const fontSizeRaw = /<a:rPr\b[^>]*\bsz="(\d+)"/i.exec(fragment)?.[1];
    const groupId = groups.find((group) => group.xml.includes(fragment))?.id;
    const zIndex = visualLayerZIndex(xml, shape.index ?? 0);
    if (text) return { id: newMutationId(), kind: "text", name: `Text ${index + 1}`, ...position, zIndex, groupId, text, color, fontSize: fontSizeRaw ? Math.max(8, Math.round(Number(fontSizeRaw) / 100)) : 56 };
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
  const zip = await JSZip.loadAsync(new Uint8Array(bytes));
  const presentationId = newMutationId();
  const mediaDirectory = join(getDesktopDataDirectory(), "presentation-media", presentationId);
  mkdirSync(mediaDirectory, { recursive: true });
  try {
  const slideFiles = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!slideFiles.length) throw new Error("This file does not contain PowerPoint slides.");
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
  const slides = [] as ImportedPresentation["slides"];
  for (const [slideIndex, file] of slideFiles.entries()) {
    const xml = await zip.file(file)!.async("string");
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
