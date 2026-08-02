import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith("_secure_worship_remote_pairing.sql"),
);
const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8").toLowerCase()
  : "";

describe("secure Worship Remote pairing migration", () => {
  it("is append-only and separates claim and control expiry", () => {
    expect(migrationName).toBe("20260802040000_secure_worship_remote_pairing.sql");
    expect(sql).toContain("pin_code_hash");
    expect(sql).toContain("claim_expires_at");
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("interval '8 hours'");
  });

  it("creates authenticated, team-scoped pairing RPCs", () => {
    expect(sql).toContain("create or replace function public.create_worship_remote_pairing");
    expect(sql).toContain("create or replace function public.claim_worship_remote_pairing_by_pin");
    expect(sql).toContain("create or replace function public.resume_worship_remote_pairing");
    expect(sql).toContain("create or replace function public.revoke_worship_remote_pairing");
    expect(sql).toContain("private.is_active_worship_remote_member");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function public.create_worship_remote_pairing(uuid) from anon");
  });

  it("rate limits PIN guesses and protects private session topics", () => {
    expect(sql).toContain("private.worship_remote_pairing_attempts");
    expect(sql).toContain("failure_count >= 5");
    expect(sql).toContain("worship-remote-session");
    expect(sql).toContain("private.can_access_worship_remote_session");
    expect(sql).toContain("realtime.messages.private = true");
  });
});
