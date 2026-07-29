import JSZip from "jszip";
import { posix as pathPosix } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDesktopDatabase, newMutationId, nowIso } from "@/lib/desktop/db";
import { getDesktopDataDirectory } from "@/lib/desktop/runtime";
import type { PresentationSlide, SceneLayer } from "@/lib/domain/presentation";

export type ImportedPresentation = { id: string; name: string; slides: Array<{ id: string; layers: SceneLayer[] }>; report: { importedText: number; warnings: string[] } };

export function cleanImportedPresentationName(value: string) {
  const name = value.trim().replace(/\.pptx$/i, "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new Error("A presentation name is required.");
  return name;
}

/** Convert persisted desktop-only PPTX records back into editable presenter slides. */
export function importedPresentationSlides(presentation: ImportedPresentation): PresentationSlide[] {
  return presentation.slides.map((slide) => ({
    id: slide.id,
    type: "teaching",
    content: [],
    sectionLabel: presentation.name,
    sceneLayers: slide.layers,
  }));
}

export function listImportedPresentations(teamId: string): ImportedPresentation[] {
  const rows = getDesktopDatabase().prepare("SELECT id, name, presentation_json, report_json FROM desktop_imported_presentations WHERE team_id = ? ORDER BY created_at DESC").all(teamId) as { id: string; name: string; presentation_json: string; report_json: string }[];
  return rows.flatMap((row) => {
    try {
      const slides = JSON.parse(row.presentation_json);
      const report = JSON.parse(row.report_json);
      return Array.isArray(slides) && report && typeof report === "object" ? [{ id: row.id, name: row.name, slides, report }] : [];
    } catch { return []; }
  });
}

export function renameImportedPresentation(teamId: string, presentationId: string, name: string) {
  const result = getDesktopDatabase().prepare("UPDATE desktop_imported_presentations SET name = ? WHERE id = ? AND team_id = ?").run(cleanImportedPresentationName(name), presentationId, teamId);
  if (!result.changes) throw new Error("Imported presentation was not found.");
}

export function deleteImportedPresentation(teamId: string, presentationId: string) {
  const removed = getDesktopDatabase().prepare("DELETE FROM desktop_imported_presentations WHERE id = ? AND team_id = ?").run(presentationId, teamId);
  if (removed.changes && /^[a-zA-Z0-9_-]{1,128}$/.test(presentationId)) rmSync(join(getDesktopDataDirectory(), "presentation-media", presentationId), { recursive: true, force: true });
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

export async function importPptx(teamId: string, name: string, bytes: ArrayBuffer): Promise<ImportedPresentation> {
  const zip = await JSZip.loadAsync(bytes);
  const presentationId = newMutationId();
  const mediaDirectory = join(getDesktopDataDirectory(), "presentation-media", presentationId);
  mkdirSync(mediaDirectory, { recursive: true });
  const slideFiles = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!slideFiles.length) throw new Error("This file does not contain PowerPoint slides.");
  const warnings: string[] = [];
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
    slides.push({ id: `pptx-${newMutationId()}`, layers });
  }
  const imported: ImportedPresentation = { id: presentationId, name: cleanImportedPresentationName(name || "Imported presentation"), slides, report: { importedText, warnings } };
  getDesktopDatabase().prepare("INSERT INTO desktop_imported_presentations (id, team_id, name, presentation_json, report_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(imported.id, teamId, imported.name, JSON.stringify(imported.slides), JSON.stringify(imported.report), nowIso());
  return imported;
}
