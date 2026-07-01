import { describe, expect, it } from "vitest";
import { capoSuggestion, chordToNashville, progressionToNashville, transposeChord, transposeProgression } from "@/lib/domain/chords";

describe("chord helpers", () => {
  it("transposes major and minor chords between keys", () => {
    expect(transposeChord("G", "G", "A")).toBe("A");
    expect(transposeChord("Em", "G", "A")).toBe("F#m");
  });

  it("transposes progressions without mutating spacing", () => {
    expect(transposeProgression("G - D - Em - C", "G", "A")).toBe("A - E - F#m - D");
  });

  it("converts chords to Nashville numbers", () => {
    expect(chordToNashville("G", "G")).toBe("1");
    expect(chordToNashville("Em", "G")).toBe("6m");
    expect(progressionToNashville("G D Em C", "G")).toBe("1 5 6m 4");
  });

  it("suggests simple capo positions", () => {
    expect(capoSuggestion("G", "A")).toBe("Capo 2");
    expect(capoSuggestion("G", "G")).toBe("Open");
  });

  it("leaves unsupported chord tokens alone", () => {
    expect(transposeChord("not-a-chord", "G", "A")).toBe("not-a-chord");
    expect(capoSuggestion("H", "A")).toBeNull();
  });
});
