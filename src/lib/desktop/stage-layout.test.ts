import { describe, expect, it } from "vitest";
import { stageLayoutPreset } from "./stage-layout";

describe("desktop stage layouts", () => {
  it("provides a lyrics-and-chords layout for musicians", () => {
    expect(stageLayoutPreset("lyrics-chords")).toEqual({ showCurrent: true, showNext: true, showChords: true, showNotes: true, showClock: true, showCountdown: true });
  });
});
