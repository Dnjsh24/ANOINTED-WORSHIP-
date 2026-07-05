import { describe, expect, it } from "vitest";
import { scoreNoteDistribution } from "./voice-key-detector";

describe("scoreNoteDistribution", () => {
  it("detects C major from C major weighted tones", () => {
    const counts = [30, 1, 12, 1, 15, 18, 1, 20, 1, 14, 1, 10];
    const result = scoreNoteDistribution(counts);
    expect(result?.key).toBe("C");
    expect(result?.mode).toBe("major");
  });

  it("detects A minor from A minor weighted tones", () => {
    const counts = [14, 1, 9, 1, 13, 16, 1, 19, 1, 26, 1, 8];
    const result = scoreNoteDistribution(counts);
    expect(result?.key).toBe("A");
    expect(result?.mode).toBe("minor");
  });

  it("returns null with too little data", () => {
    const counts = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    expect(scoreNoteDistribution(counts)).toBeNull();
  });
});
