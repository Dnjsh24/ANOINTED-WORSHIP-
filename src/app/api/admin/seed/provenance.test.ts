import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync("src/app/api/admin/seed/route.ts", "utf8");
const unseedSource = readFileSync("src/app/api/admin/unseed/route.ts", "utf8");

describe("starter library provenance", () => {
  it("marks every starter-library song with an immutable seed source", () => {
    expect(seedSource).toContain("STARTER_LIBRARY_SEED_SOURCE");
    expect(seedSource).toContain("seed_source: STARTER_LIBRARY_SEED_SOURCE");
  });

  it("removes only provenance-marked rows instead of matching user-visible titles", () => {
    expect(unseedSource).toContain("STARTER_LIBRARY_SEED_SOURCE");
    expect(unseedSource).toContain('.eq("seed_source", STARTER_LIBRARY_SEED_SOURCE)');
    expect(unseedSource).not.toContain("seedSongs.map");
    expect(unseedSource).not.toContain('.in("title"');
  });
});
