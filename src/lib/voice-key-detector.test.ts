import { describe, expect, it } from "vitest";
import { scoreNoteDistribution } from "./voice-key-detector";

describe("scoreNoteDistribution", () => {
  it("detects C major from C major weighted tones", () => {
    const counts = [30, 1, 12, 1, 15, 18, 1, 20, 1, 14, 1, 10];
    const result = scoreNoteDistribution(counts);
    expect(result?.key).toBe("C");
    expect(result?.mode).toBe("major");
    expect(result?.confidence).toBeGreaterThan(0.3);
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

  it("returns null when melody only has a few unique pitch classes", () => {
    const counts = [12, 0, 0, 0, 9, 0, 0, 8, 0, 0, 0, 0];
    expect(scoreNoteDistribution(counts)).toBeNull();
  });

  it("can use final note as a mild tonic hint", () => {
    const counts = [18, 0, 7, 0, 10, 0, 0, 17, 0, 8, 0, 0];
    const result = scoreNoteDistribution(counts, { finalNoteIndex: 0, topNoteIndex: 7 });
    expect(result?.key).toBe("C");
    expect(result?.mode).toBe("major");
  });
});
