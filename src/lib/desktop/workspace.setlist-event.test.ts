import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDesktopDatabase } from "./db";
import { upsertDesktopSetlist } from "./workspace";

describe("desktop setlist event linking", () => {
  beforeEach(() => {
    process.env.ANW_DESKTOP_MODE = "1";
    process.env.ANW_DESKTOP_DATA_DIR = mkdtempSync(join(tmpdir(), "anw-setlist-event-"));
  });

  it("stores a standalone setlist without creating a local Timeline event", () => {
    upsertDesktopSetlist({
      id: "setlist-1",
      eventId: null,
      teamId: "team-1",
      name: "Sunday Worship",
      date: "2026-08-16",
      eventType: "service",
      location: "Main Sanctuary",
      callTime: "09:00",
      rehearsalTime: "08:00",
      serviceTimes: ["Sunday Worship"],
    });

    const db = getDesktopDatabase();
    expect(db.prepare("SELECT COUNT(*) AS count FROM local_events").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT event_id FROM local_setlists WHERE id = ?").get("setlist-1")).toEqual({ event_id: null });
  });

  it("links an existing local event without editing its Timeline details", () => {
    const db = getDesktopDatabase();
    db.prepare(`
      INSERT INTO local_events (id, team_id, name, type, event_date, updated_at)
      VALUES ('event-1', 'team-1', 'Original Event', 'service', '2026-08-16', '2026-08-13T00:00:00.000Z')
    `).run();

    upsertDesktopSetlist({
      id: "setlist-1",
      eventId: "event-1",
      teamId: "team-1",
      name: "Changed Setlist Name",
      date: "2026-08-17",
      eventType: "meeting",
      serviceTimes: [],
    });

    expect(db.prepare("SELECT name, type, event_date FROM local_events WHERE id = ?").get("event-1")).toEqual({
      name: "Original Event",
      type: "service",
      event_date: "2026-08-16",
    });
    expect(db.prepare("SELECT event_id FROM local_setlists WHERE id = ?").get("setlist-1")).toEqual({ event_id: "event-1" });
  });

  it("syncs standalone setlists without requiring a cloud event", () => {
    const migrationPath = "supabase/migrations/20260813010000_allow_standalone_setlist_sync.sql";
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("v_event_id := nullif(p_payload->>'eventId', '')::uuid;");
    expect(migration).toContain("if v_event_id is not null then");
    expect(migration).not.toContain("insert into public.events");
    expect(migration).toContain("select 1 from public.events where id = v_event_id and team_id = v_team_id");
    expect(migration).toContain("values (v_song_id, v_team_id, v_event_id,");
  });
});
