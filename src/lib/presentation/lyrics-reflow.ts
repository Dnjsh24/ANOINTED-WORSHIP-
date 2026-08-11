import type { SlideBlock } from "@/lib/domain/presentation";

const VISUAL_ROW_TOLERANCE = 2;

/**
 * Returns the text currently represented by a slide's editable blocks.
 * Blocks on the same visual row are combined so word-level overrides remain
 * readable in the Lyrics Reflow sidebar.
 */
export function resolveLyricsReflowPreviewLines(
  generatedLines: readonly string[],
  overriddenBlocks?: readonly SlideBlock[],
): string[] {
  if (!overriddenBlocks?.length) return [...generatedLines];

  const rows: Array<{ y: number; blocks: Array<SlideBlock & { originalIndex: number }> }> = [];
  const blocksInVisualOrder = overriddenBlocks
    .map((block, originalIndex) => ({ ...block, originalIndex }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.originalIndex - b.originalIndex);

  for (const block of blocksInVisualOrder) {
    const row = rows.find((candidate) => Math.abs(candidate.y - block.y) <= VISUAL_ROW_TOLERANCE);
    if (row) {
      row.blocks.push(block);
      row.y = row.blocks.reduce((sum, item) => sum + item.y, 0) / row.blocks.length;
    } else {
      rows.push({ y: block.y, blocks: [block] });
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => row.blocks
      .sort((a, b) => a.x - b.x || a.originalIndex - b.originalIndex)
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join(" "));
}
