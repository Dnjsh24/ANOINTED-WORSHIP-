import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith("_fix_worship_remote_realtime_authorization.sql"),
);
const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8").toLowerCase()
  : "";

describe("Worship Remote Realtime authorization repair", () => {
  it("recreates both authenticated Broadcast policies", () => {
    expect(migrationName).toBeTruthy();
    expect(sql).toContain(
      'create policy "worship remote operators can receive private broadcasts"',
    );
    expect(sql).toContain(
      'create policy "worship remote operators can send private broadcasts"',
    );
    expect(sql).toContain("on realtime.messages for select to authenticated");
    expect(sql).toContain("on realtime.messages for insert to authenticated");
  });

  it("keeps topic and membership authorization without requiring the synthetic private flag", () => {
    expect(sql).toContain("realtime.messages.extension = 'broadcast'");
    expect(sql).toContain("split_part(realtime.topic(), ':', 1) = 'worship-remote'");
    expect(sql).toContain(
      "private.can_access_worship_remote_session(realtime.topic())",
    );
    expect(sql).not.toContain("realtime.messages.private = true");
  });
});
