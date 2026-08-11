import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260812000000_add_setlist_song_arrangement_sections.sql",
  ),
  "utf8",
).toLowerCase();

describe("arrangement section persistence migration", () => {
  it("adds a nullable jsonb column without rewriting existing setlist songs", () => {
    expect(migration).toContain(
      "alter table public.setlist_songs add column if not exists arrangement_sections jsonb",
    );
    expect(migration).not.toContain("not null");
    expect(migration).not.toContain("default");
  });
});
