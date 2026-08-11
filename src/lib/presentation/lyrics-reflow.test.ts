import { describe, expect, it } from "vitest";
import type { SlideBlock } from "@/lib/domain/presentation";
import { resolveLyricsReflowPreviewLines } from "./lyrics-reflow";

const lineBlock = (id: string, text: string, x: number, y: number): SlideBlock => ({
  id,
  text,
  x,
  y,
  startTime: 0,
  duration: 2,
});

describe("resolveLyricsReflowPreviewLines", () => {
  it("shows edited block text instead of stale generated lyrics", () => {
    const lines = resolveLyricsReflowPreviewLines(
      ["Washed in the blood"],
      [lineBlock("line-1", "Hello", 50, 50)],
    );

    expect(lines).toEqual(["Hello"]);
  });

  it("keeps generated lyric lines when the slide has no block override", () => {
    expect(resolveLyricsReflowPreviewLines(["Original line"], undefined)).toEqual(["Original line"]);
    expect(resolveLyricsReflowPreviewLines(["Original line"], [])).toEqual(["Original line"]);
  });

  it("combines word blocks into visual reading order", () => {
    const lines = resolveLyricsReflowPreviewLines(
      ["Original line"],
      [
        lineBlock("word-2", "world", 60, 40.5),
        lineBlock("word-3", "Again", 40, 60),
        lineBlock("word-1", "Hello", 40, 40),
      ],
    );

    expect(lines).toEqual(["Hello world", "Again"]);
  });

  it("keeps a stable order for blocks sharing the same position and ignores blank text", () => {
    const lines = resolveLyricsReflowPreviewLines(
      ["Original line"],
      [
        lineBlock("same-position-1", "second", 50, 50),
        lineBlock("same-position-2", "   ", 50, 50),
        lineBlock("leftmost", "first", 40, 50),
      ],
    );

    expect(lines).toEqual(["first second"]);
  });
});
