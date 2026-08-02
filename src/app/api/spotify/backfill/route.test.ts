import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(
  process.cwd(),
  "src",
  "app",
  "api",
  "spotify",
  "backfill",
  "route.ts",
), "utf8");

describe("Spotify backfill route", () => {
  it("uses one bounded team-scoped update instead of an N+1 loop", () => {
    expect(source).not.toContain("for (const song of songs)");
    expect(source).toContain('.eq("team_id", membership.team_id)');
    expect(source).toContain('.not("image_url", "is", null)');
    expect(source).toContain('count: "exact"');
  });
});
