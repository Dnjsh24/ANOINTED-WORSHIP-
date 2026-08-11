import { describe, expect, it } from "vitest";
import {
  createArrangementSectionId,
  createArrangementSections,
  formatArrangementSequence,
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

  it("derives the full sequence from lyrics and retains inline chords", () => {
    const sections = createArrangementSections("", lyrics);

    expect(sections.map((section) => section.label)).toEqual(["Intro", "Verse 1", "Chorus"]);
    expect(sections[2]?.content).toBe("[C]Jesus is [F]Lord");
    expect(createArrangementSectionId("!!!")).toMatch(/^section-/);
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
    expect(parseArrangementSections("not json")).toBeNull();
    expect(parseArrangementSections(null)).toBeNull();
    expect(
      parseArrangementSections(
        Array.from({ length: 101 }, (_, index) => ({
          id: `section-${index}`,
          label: "Verse",
          content: "",
        })),
      ),
    ).toBeNull();
    expect(parseArrangementSections([{ id: "", label: "Ending", content: "C" }])).toBeNull();
    expect(
      parseArrangementSections([
        { id: "ending-1", label: "Ending", content: "x".repeat(20_001) },
      ]),
    ).toBeNull();
  });

  it("normalizes saved text and formats the compatibility sequence", () => {
    const parsed = parseArrangementSections([
      { id: "verse-1", label: " Verse 1 ", content: "C\r\nA lyric" },
    ]);

    expect(parsed).toEqual([{ id: "verse-1", label: "Verse 1", content: "C\nA lyric" }]);
    expect(formatArrangementSequence([
      { id: "verse-1", label: " Verse 1 ", content: "" },
      { id: "blank", label: " ", content: "" },
      { id: "ending", label: "Ending", content: "" },
    ])).toBe("Verse 1, Ending");
  });

  it("falls back to song lyrics when no custom arrangement has been saved", () => {
    expect(resolveArrangementSongSections(lyrics, null)).toHaveLength(3);
    expect(resolveArrangementSongSections(lyrics, [
      { id: "ending", label: "Ending", content: "" },
    ])).toEqual([{ label: "Ending", lines: [] }]);
  });
});
