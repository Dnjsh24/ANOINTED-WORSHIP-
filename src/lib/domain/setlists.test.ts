import { describe, expect, it } from "vitest";
import { moveSetlistSong, sortSetlistSongs } from "@/lib/domain/setlists";
import { songs } from "@/lib/sample-data";
import type { SetlistSong } from "@/lib/types";

const slots: SetlistSong[] = [
  { id: "third", song: songs[0], order: 3, assignedKey: "B" },
  { id: "first", song: songs[1], order: 1, assignedKey: "D" },
  { id: "second", song: songs[2], order: 2, assignedKey: "A" },
];

describe("setlist helpers", () => {
  it("sorts songs by assigned order immutably", () => {
    expect(sortSetlistSongs(slots).map((slot) => slot.id)).toEqual(["first", "second", "third"]);
    expect(slots[0].id).toBe("third");
  });

  it("moves a song up without mutating the original array", () => {
    expect(moveSetlistSong(slots, "third", "up").map((slot) => slot.id)).toEqual(["first", "third", "second"]);
    expect(slots.map((slot) => slot.id)).toEqual(["third", "first", "second"]);
  });

  it("returns sorted songs when movement is out of range", () => {
    expect(moveSetlistSong(slots, "first", "up").map((slot) => slot.id)).toEqual(["first", "second", "third"]);
    expect(moveSetlistSong(slots, "missing", "down").map((slot) => slot.id)).toEqual(["first", "second", "third"]);
  });
});
