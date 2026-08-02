import { describe, expect, it } from "vitest";
import { isAllowedLyricShortcut, resolveLyricShortcuts } from "./lyric-shortcuts";

describe("lyric shortcuts", () => {
  it("assigns the default 1-9, 0, A-Z sequence", () => {
    const slides = Array.from({ length: 12 }, (_, index) => `slide-${index + 1}`);
    const resolved = resolveLyricShortcuts(slides, {});
    expect(slides.map((slideId) => resolved[slideId])).toEqual([
      "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
      "Digit7", "Digit8", "Digit9", "Digit0", "KeyA", "KeyB",
    ]);
  });

  it("gives custom bindings priority without duplicate keys", () => {
    expect(resolveLyricShortcuts(["one", "two", "three"], { three: "Digit1" })).toEqual({
      one: "Digit2",
      two: "Digit3",
      three: "Digit1",
    });
  });

  it("rejects modifiers, punctuation, and unsupported keys", () => {
    expect(isAllowedLyricShortcut("Digit9")).toBe(true);
    expect(isAllowedLyricShortcut("KeyZ")).toBe(true);
    expect(isAllowedLyricShortcut("F1")).toBe(false);
    expect(isAllowedLyricShortcut("ControlLeft")).toBe(false);
    expect(isAllowedLyricShortcut("Semicolon")).toBe(false);
  });
});
