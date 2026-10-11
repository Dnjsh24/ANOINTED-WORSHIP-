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
delete from public.teams where id = any(array['${teamId}'::uuid]);
commit;`);
  });

  it.each([null, [null], [""], [teamId + "'; delete from public.teams; --"], [teamId + "\n"]])(
    "rejects unsafe or malformed fixture identifiers: %j", (ids) => {
      expect(() => buildLocalTeamFixtureCleanupSql(ids)).toThrow(/exact team UUIDs/);
    },
  );
});
