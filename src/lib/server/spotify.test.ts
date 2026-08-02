import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSpotifyAccessToken,
  parseSpotifySearchQuery,
  resetSpotifyTokenCacheForTests,
} from "@/lib/server/spotify";

describe("Spotify server boundary", () => {
  beforeEach(() => {
    resetSpotifyTokenCacheForTests();
  });

  it("normalizes and bounds search queries", () => {
    expect(parseSpotifySearchQuery("  Amazing Grace ")).toBe("Amazing Grace");
    expect(() => parseSpotifySearchQuery("")).toThrow("required");
    expect(() => parseSpotifySearchQuery("x".repeat(121))).toThrow("too long");
  });

  it("reuses a valid access token instead of authenticating for every search", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      access_token: "token-one",
      expires_in: 3600,
    }));

    await expect(getSpotifyAccessToken("client", "secret", fetcher, 1_000)).resolves.toBe("token-one");
    await expect(getSpotifyAccessToken("client", "secret", fetcher, 2_000)).resolves.toBe("token-one");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed and oversized provider responses", async () => {
    const malformed = vi.fn().mockResolvedValue(Response.json({ nope: true }));
    await expect(getSpotifyAccessToken("client", "secret", malformed, 1_000)).rejects.toThrow(
      "invalid",
    );

    const oversized = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: "x".repeat(70_000), expires_in: 3600 }),
      { headers: { "content-type": "application/json" } },
    ));
    await expect(getSpotifyAccessToken("client", "secret", oversized, 1_000)).rejects.toThrow(
      "too large",
    );
  });
});
