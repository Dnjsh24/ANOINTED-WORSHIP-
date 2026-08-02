export const DEFAULT_LYRIC_SHORTCUT_CODES = [
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5",
  "Digit6", "Digit7", "Digit8", "Digit9", "Digit0",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
] as const;

export type LyricShortcutCode = typeof DEFAULT_LYRIC_SHORTCUT_CODES[number];

export function isAllowedLyricShortcut(value: unknown): value is LyricShortcutCode {
  return typeof value === "string" && (DEFAULT_LYRIC_SHORTCUT_CODES as readonly string[]).includes(value);
}

export function lyricShortcutLabel(code: string) {
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}

/**
 * Custom assignments reserve their keys first. Remaining slides receive the
 * next free default in slide order, so changing a binding never creates a
 * duplicate or silently disables another lyric slide.
 */
export function resolveLyricShortcuts(
  slideIds: string[],
  customBySlideId: Record<string, string>,
) {
  const resolved: Record<string, string> = {};
  const reserved = new Set<string>();

  for (const slideId of slideIds) {
    const custom = customBySlideId[slideId];
    if (!isAllowedLyricShortcut(custom) || reserved.has(custom)) continue;
    resolved[slideId] = custom;
    reserved.add(custom);
  }

  let defaultIndex = 0;
  for (const slideId of slideIds) {
    if (resolved[slideId]) continue;
    while (defaultIndex < DEFAULT_LYRIC_SHORTCUT_CODES.length && reserved.has(DEFAULT_LYRIC_SHORTCUT_CODES[defaultIndex])) {
      defaultIndex += 1;
    }
    const next = DEFAULT_LYRIC_SHORTCUT_CODES[defaultIndex];
    if (!next) break;
    resolved[slideId] = next;
    reserved.add(next);
    defaultIndex += 1;
  }

  return resolved;
}
