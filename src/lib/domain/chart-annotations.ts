import { z } from "zod";

export const noteFonts = { sans: "Arial, sans-serif", serif: "Georgia, serif", mono: "monospace" } as const;
export const annotationColors = [
  { name: "Yellow", value: "#facc15" }, { name: "White", value: "#ffffff" },
  { name: "Coral", value: "#fb7185" }, { name: "Sky", value: "#38bdf8" },
  { name: "Mint", value: "#6ee7b7" }, { name: "Lavender", value: "#c4b5fd" },
] as const;
const chartNoteSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(4000),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  font: z.enum(["sans", "serif", "mono"]),
  fontSize: z.number().int().min(12).max(72),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#facc15"),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  strike: z.boolean(),
});
export type ChartNote = z.infer<typeof chartNoteSchema>;

export function parseChartNotes(raw: string | null): ChartNote[] {
  if (!raw) return [];
  try {
    const result = z.array(chartNoteSchema).max(100).safeParse(JSON.parse(raw));
    return result.success ? result.data : [];
  } catch { return []; }
}

export function chartAnnotationKeys(setlistId: string, slotId: string, songId?: string) {
  return {
    notes: `chart-notes_${setlistId}_${slotId}`,
    drawing: `chart-drawing_${setlistId}_${slotId}`,
    legacyDrawing: songId ? `scribbles_${setlistId}_${songId}` : undefined,
  };
}
