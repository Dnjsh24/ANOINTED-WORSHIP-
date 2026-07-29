import { describe, expect, it } from "vitest";
import { buildLivePresentationSnapshot, isLivePresentationSnapshot } from "./live-snapshot";

const setlist = {
  id: "setlist-1",
  name: "Sunday Service",
  songs: [
    { id: "item-1", song: { id: "song-1", title: "First", lyricsChords: "[Verse]\nFirst line" } },
    { id: "item-2", song: { id: "song-2", title: "Second", lyricsChords: "[Verse]\nSecond line" } },
  ],
};

describe("live presentation snapshot", () => {
  it("namespaces generated slide IDs by setlist item", () => {
    const snapshot = buildLivePresentationSnapshot({ setlist, revision: 3 });

    expect(snapshot.items[0].slides[0].id).toMatch(/^item-1:/);
    expect(snapshot.items[1].slides[0].id).toMatch(/^item-2:/);
    expect(snapshot.items[0].slides[0].id).not.toBe(snapshot.items[1].slides[0].id);
    expect(isLivePresentationSnapshot(snapshot)).toBe(true);
  });

  it("uses a setlist-only lyric draft and legacy slide overrides", () => {
    const snapshot = buildLivePresentationSnapshot({
      setlist,
      revision: 4,
      draft: {
        lyricsBySetlistSongId: { "item-1": "[Verse]\nCorrected line" },
        slideOverrides: {
          "slide-sec0-0-reflow4": [{
            id: "block-1",
            text: "Corrected",
            x: 10,
            y: 10,
            startTime: 0,
            duration: 3,
          }],
        },
      },
    });

    expect(snapshot.items[0].lyricsChords).toContain("Corrected line");
    expect(snapshot.items[1].lyricsChords).toContain("Second line");
    expect(snapshot.items[0].slides[0].blocks?.[0].text).toBe("Corrected");
  });
});
