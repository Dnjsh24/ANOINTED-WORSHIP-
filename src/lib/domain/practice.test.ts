import { describe, expect, it } from "vitest";
import {
  getPreferredProvider,
  getSpotifyTrackInfo,
  getYouTubeVideoId,
  parseTimeSignature,
} from "./practice";

describe("practice domain logic", () => {
  describe("getYouTubeVideoId", () => {
    it("extracts ID from standard watch URL", () => {
      expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from short YouTube URL", () => {
      expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from embed URL", () => {
      expect(getYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("returns null for null, empty or invalid URLs", () => {
      expect(getYouTubeVideoId(null)).toBeNull();
      expect(getYouTubeVideoId("")).toBeNull();
      expect(getYouTubeVideoId("https://example.com")).toBeNull();
    });
  });

  describe("getSpotifyTrackInfo", () => {
    it("extracts track ID and generates embed/external URLs", () => {
      const info = getSpotifyTrackInfo("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
      expect(info).toEqual({
        trackId: "4cOdK2wGLETKBW3PvgPWqT",
        embedUrl: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
        externalUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      });
    });

    it("returns null for invalid Spotify URLs", () => {
      expect(getSpotifyTrackInfo(null)).toBeNull();
      expect(getSpotifyTrackInfo("https://spotify.com")).toBeNull();
      expect(getSpotifyTrackInfo("https://open.spotify.com/artist/12345")).toBeNull();
    });
  });

  describe("getPreferredProvider", () => {
    it("prefers YouTube when both are present", () => {
      const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const sp = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
      expect(getPreferredProvider(yt, sp)).toBe("youtube");
    });

    it("falls back to Spotify when YouTube is missing", () => {
      const sp = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
      expect(getPreferredProvider(null, sp)).toBe("spotify");
    });

    it("uses YouTube when Spotify is missing", () => {
      const yt = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(getPreferredProvider(yt, null)).toBe("youtube");
    });

    it("returns null when neither is valid", () => {
      expect(getPreferredProvider(null, null)).toBeNull();
      expect(getPreferredProvider("invalid", "invalid")).toBeNull();
    });
  });

  describe("parseTimeSignature", () => {
    it("parses 4/4 correctly", () => {
      expect(parseTimeSignature("4/4")).toEqual({
        beatsPerMeasure: 4,
        beatValue: 4,
        beatUnit: 4,
        display: "4/4",
      });
    });

    it("parses 3/4 and 6/8 correctly", () => {
      expect(parseTimeSignature("3/4")).toEqual({
        beatsPerMeasure: 3,
        beatValue: 4,
        beatUnit: 4,
        display: "3/4",
      });
      expect(parseTimeSignature("6/8")).toEqual({
        beatsPerMeasure: 6,
        beatValue: 8,
        beatUnit: 8,
        display: "6/8",
      });
    });

    it("falls back to 4/4 for invalid or missing time signature", () => {
      expect(parseTimeSignature(null)).toEqual({
        beatsPerMeasure: 4,
        beatValue: 4,
        beatUnit: 4,
        display: "4/4",
      });
      expect(parseTimeSignature("invalid")).toEqual({
        beatsPerMeasure: 4,
        beatValue: 4,
        beatUnit: 4,
        display: "4/4",
      });
      expect(parseTimeSignature("0/4")).toEqual({
        beatsPerMeasure: 4,
        beatValue: 4,
        beatUnit: 4,
        display: "4/4",
      });
    });
  });
});
