import { describe, it, expect } from "vitest";
import { detectKey, detectKeyFromText, extractChordRoots } from "./detect-key-from-chords";

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
    const result = detectKey(["C", "G", "Am", "F"]);
    expect(result?.key).toBe("C");
    expect(result?.mode).toBe("major");
  });

  it("detects G major from G-D-Em-C", () => {
    const result = detectKey(["G", "D", "Em", "C"]);
    expect(result?.key).toBe("G");
    expect(result?.mode).toBe("major");
  });

  it("detects D major from D-G-A-Bm", () => {
    const result = detectKey(["D", "G", "A", "Bm"]);
    expect(result?.key).toBe("D");
    expect(result?.mode).toBe("major");
  });

  it("detects A minor from Am-F-C-G", () => {
    const result = detectKey(["Am", "F", "C", "G"]);
    expect(result?.key).toBe("A");
    expect(result?.mode).toBe("minor");
  });

  it("returns null for empty input", () => {
    expect(detectKey([])).toBeNull();
  });

  it("handles flat keys", () => {
    const result = detectKey(["Bb", "Eb", "F", "Gm"]);
    expect(result?.key).toBe("Bb");
    expect(result?.mode).toBe("major");
  });

  it("prefers flat notation when input uses flats", () => {
    const result = detectKey(["Bb", "F", "Eb", "Ab"]);
    expect(result?.key).toBe("Ab");
    expect(result?.mode).toBe("major");
  });

  it("detects key from full verse progression", () => {
    const result = detectKey(["C", "G", "Am", "F", "C", "G", "F", "C"]);
    expect(result?.key).toBe("C");
    expect(result?.mode).toBe("major");
  });

  it("detects E minor with harmonic dominant", () => {
    const result = detectKey(["Em", "C", "G", "D", "B7", "Em"]);
    expect(result?.key).toBe("E");
    expect(result?.mode).toBe("minor");
  });

  it("detects from full text with sections", () => {
    const text = `[Verse]\nG  D  Em  C\nYou are here\n\n[Chorus]\nC  G  D  G\nYou are good`;
    const result = detectKeyFromText(text);
    expect(result?.key).toBe("G");
    expect(result?.mode).toBe("major");
  });
});
