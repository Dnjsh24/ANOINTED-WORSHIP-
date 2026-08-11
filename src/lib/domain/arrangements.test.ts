import { describe, expect, it } from "vitest";
import {
  createArrangementSections,
  parseArrangementSections,
  resolveArrangementSongSections,
  serializeArrangementSections,
} from "@/lib/domain/arrangements";

const lyrics = `[Intro]
C  F

[Verse 1]
G
Every knee will bow

[Chorus]
[C]Jesus is [F]Lord`;

describe("arrangement section content", () => {
  it("maps existing song content and leaves a new Ending ready to edit", () => {
    const sections = createArrangementSections("Intro, Verse 1, Ending", lyrics);

    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({ label: "Intro", content: "C  F" });
    expect(sections[1]?.content).toContain("Every knee will bow");
    expect(sections[2]).toMatchObject({ label: "Ending", content: "" });
  });

  it("preserves separate edits for repeated sequence items", () => {
    const serialized = serializeArrangementSections([
      { id: "chorus-1", label: "Chorus", content: "C\nFirst chorus" },
      { id: "chorus-2", label: "Chorus", content: "F\nFinal chorus" },
    ]);

    expect(parseArrangementSections(serialized)).toEqual([
      { id: "chorus-1", label: "Chorus", content: "C\nFirst chorus" },
      { id: "chorus-2", label: "Chorus", content: "F\nFinal chorus" },
    ]);
  });

  it("turns saved custom content into renderable chord and lyric sections", () => {
    const sections = resolveArrangementSongSections(lyrics, [
      { id: "ending-1", label: "Ending", content: "G  C\nYou reign forever" },
    ]);

    expect(sections).toEqual([
      {
        label: "Ending",
        lines: [{ chords: "G  C", lyric: "You reign forever" }],
      },
    ]);
  });

  it("rejects malformed or oversized saved arrangement content", () => {
    expect(parseArrangementSections([{ id: "", label: "Ending", content: "C" }])).toBeNull();
    expect(
      parseArrangementSections([
        { id: "ending-1", label: "Ending", content: "x".repeat(20_001) },
      ]),
    ).toBeNull();
  });
});
