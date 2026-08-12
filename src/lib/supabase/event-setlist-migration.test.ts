import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expandPath = "supabase/migrations/20260813020000_expand_event_metadata.sql";
const dataPath = "supabase/migrations/20260813020100_backfill_event_setlist_metadata.sql";
const contractPath = "supabase/migrations/20260813020200_enforce_event_setlist_relationship.sql";

describe("event and setlist separation migrations", () => {
  it("uses separate expand, data, and contract migrations", () => {
    expect(existsSync(expandPath)).toBe(true);
    expect(existsSync(dataPath)).toBe(true);
    expect(existsSync(contractPath)).toBe(true);
  });

  it("adds event-owned service type and enforces one setlist per event", () => {
    const expand = readFileSync(expandPath, "utf8");
    const contract = readFileSync(contractPath, "utf8");

    expect(expand).toContain("add column if not exists service_type text");
    expect(contract).toContain("create unique index");
    expect(contract).toContain("where event_id is not null");
  });

  it("preserves the opposite record when deleting an event or setlist", () => {
    const contract = readFileSync(contractPath, "utf8");

    expect(contract).toContain("update public.setlists");
    expect(contract).toContain("set event_id = null");
    expect(contract).not.toContain("delete from public.setlists where event_id = p_event_id");
    expect(contract).not.toContain("delete from public.events where id = linked_event");
  });

  it("provides an atomic team-scoped link operation", () => {
    const contract = readFileSync(contractPath, "utf8");

    expect(contract).toContain("link_event_setlist");
    expect(contract).toContain("for update");
    expect(contract).toContain("event_team");
    expect(contract).toContain("setlist_team");
    expect(contract).toContain("current_event <> p_event_id");
    expect(contract).toContain("p_setlist_id is null");
    expect(contract).toContain("private.has_team_role");
    expect(contract).toContain("revoke all on function private.link_event_setlist");
  });
});
