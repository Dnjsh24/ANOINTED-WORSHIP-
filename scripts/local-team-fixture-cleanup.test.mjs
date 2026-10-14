import { describe, expect, it } from "vitest";
import { buildLocalTeamFixtureCleanupSql } from "./local-team-fixture-cleanup.mjs";

const teamId = "01234567-89ab-cdef-0123-456789abcdef";

describe("local team fixture cleanup boundary", () => {
  it("does not issue SQL when no teams were created", () => {
    expect(buildLocalTeamFixtureCleanupSql([])).toBeNull();
  });

  it("uses only exact created IDs and a transaction-local owner guard flag", () => {
    const sql = buildLocalTeamFixtureCleanupSql([teamId, teamId]);
    expect(sql).toBe(`begin;
select set_config('app.transfer_team_ownership', 'on', true);
-- Sync tombstones reference the team. Remove children before its cascade.
delete from public.setlists where team_id = any(array['${teamId}'::uuid]);
delete from public.events where team_id = any(array['${teamId}'::uuid]);
delete from public.songs where team_id = any(array['${teamId}'::uuid]);
delete from public.teams where id = any(array['${teamId}'::uuid]);
commit;`);
  });

  it.each([null, [null], [""], [teamId + "'; delete from public.teams; --"], [teamId + "\n"]])(
    "rejects unsafe or malformed fixture identifiers: %j", (ids) => {
      expect(() => buildLocalTeamFixtureCleanupSql(ids)).toThrow(/exact team UUIDs/);
    },
  );

  it("deletes sync-producing children while the fixture team still exists", () => {
    const sql = buildLocalTeamFixtureCleanupSql([teamId]);
    const parentDelete = sql.indexOf("delete from public.teams");
    for (const table of ["setlists", "events", "songs"]) {
      const childDelete = sql.indexOf(`delete from public.${table} where team_id = any(array['${teamId}'::uuid]);`);
      expect(childDelete, `${table} must be scoped to this run's team`).toBeGreaterThan(-1);
      expect(childDelete, `${table} sync logs require the parent team`).toBeLessThan(parentDelete);
    }
    expect(sql.indexOf("delete from public.setlists")).toBeLessThan(sql.indexOf("delete from public.songs"));
    expect(sql).not.toMatch(/disable trigger|session_replication_role/i);
  });
});
