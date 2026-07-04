import { describe, it, expect } from "vitest";
import { detectKey, extractChordRoots } from "./detect-key-from-chords";

describe("extractChordRoots", () => {
  it("extracts roots from a chord progression", () => {
    const roots = extractChordRoots("C   G   Am   F   C");
    expect(roots).toEqual(["C", "G", "A", "F", "C"]);
  });

  it("extracts roots with accidentals", () => {
    const roots = extractChordRoots("C#m   F#   B   E");
    expect(roots).toEqual(["C#", "F#", "B", "E"]);
  });

  it("extracts roots from a full song format", () => {
    const lyrics = `[Verse]
C        G        Am       F
Your love is faithful

[Chorus]
F        C        G
You are good always`;
    const roots = extractChordRoots(lyrics);
    expect(roots).toEqual(["C", "G", "A", "F", "F", "C", "G"]);
  });

  it("returns empty array for no chords", () => {
    expect(extractChordRoots("Just some lyrics here")).toEqual([]);
  });
});

describe("detectKey", () => {
  it("detects C major from C-G-Am-F", () => {
    const result = detectKey(["C", "G", "A", "F"]);
    expect(result?.key).toBe("C");
  });

  it("detects G major from G-D-Em-C", () => {
    const result = detectKey(["G", "D", "E", "C"]);
    expect(result?.key).toBe("G");
  });

  it("detects D major from D-G-A-Bm", () => {
    const result = detectKey(["D", "G", "A", "B"]);
    expect(result?.key).toBe("D");
  });

  it("detects A minor from Am-F-C-G", () => {
    const result = detectKey(["A", "F", "C", "G"]);
    expect(result?.key).toBe("A");
  });

  it("returns null for empty input", () => {
    expect(detectKey([])).toBeNull();
  });

  it("handles flat keys", () => {
    const result = detectKey(["Bb", "Eb", "F", "G"]);
    expect(result?.key).toBe("Bb");
  });

  it("prefers flat notation when input uses flats", () => {
    const result = detectKey(["Bb", "F", "Eb", "Ab"]);
    expect(result?.key).toBe("Bb");
  });

  it("detects key from full verse progression", () => {
    const result = detectKey(["C", "G", "Am", "F", "C", "G", "F", "C"]);
    expect(result?.key).toBe("C");
  });
});
