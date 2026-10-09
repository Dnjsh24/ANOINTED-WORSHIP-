import { describe, expect, it } from "vitest";
import { parseSongSlotNotes } from "./song-slot-notes";

describe("song slot notes", () => {
  it("reads legacy lead, free text, template tags, and empty notes", () => {
    expect(parseSongSlotNotes("Lead: Alex").lead).toBe("Alex");
    expect(parseSongSlotNotes("Watch the transition").notes).toBe("Watch the transition");
    expect(parseSongSlotNotes("Template Tag: Praise").metadata).toEqual({ templateTag: "Praise" });
    expect(parseSongSlotNotes(null)).toMatchObject({ lead: "", notes: "" });
  });
  it("reads separate lead and notes while preserving unknown metadata", () => {
    expect(parseSongSlotNotes('{"lead":"Alex","notes":"Quiet intro","type":"Worship"}')).toEqual({ lead: "Alex", notes: "Quiet intro", metadata: { lead: "Alex", notes: "Quiet intro", type: "Worship" } });
    expect(parseSongSlotNotes("[1,2]").notes).toBe("[1,2]");
    expect(parseSongSlotNotes('{"lead":12,"notes":false}')).toMatchObject({ lead: "", notes: "" });
  });
});
