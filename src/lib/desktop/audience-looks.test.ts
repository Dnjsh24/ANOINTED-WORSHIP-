import { describe, expect, it } from "vitest";
import { decodeAudienceLookLayout, defaultAudienceLookLayout, encodeAudienceLookLayout, normalizeAudienceLookLayout } from "./audience-looks";

describe("desktop Audience Looks", () => {
  it("gives the Stream Lower Third look a distinct lower-third policy", () => {
    expect(defaultAudienceLookLayout("Stream Lower Third")).toMatchObject({
      showLyrics: true,
      showSceneLayers: true,
      showProps: true,
      lyricStyle: "lower-third",
    });
  });

  it("keeps user layout values safe and fills missing properties", () => {
    expect(normalizeAudienceLookLayout({ showLyrics: false, lyricStyle: "not-valid" })).toEqual({
      showLyrics: false,
      showSceneLayers: true,
      showProps: true,
      lyricStyle: "full",
    });
  });

  it("round-trips a custom local Look for an output URL and rejects malformed data", () => {
    const layout = { showLyrics: false, showSceneLayers: true, showProps: false, lyricStyle: "hidden" as const };
    expect(decodeAudienceLookLayout(encodeAudienceLookLayout(layout), "Main Projection")).toEqual(layout);
    expect(decodeAudienceLookLayout("not-a-valid-layout", "Stream Lower Third")).toEqual(defaultAudienceLookLayout("Stream Lower Third"));
  });
});
