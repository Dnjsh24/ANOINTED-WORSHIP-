// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const correction = readFileSync("supabase/migrations/20261012020000_website_policy_identity_initplan.sql", "utf8");
const policies = [
  ["Actor and eligible reviewer can read bounded shared requests", "shared_edit_requests", "20261006050000_shared_edit_workflow_adapters.sql"],
  ["Active members add songs with immutable identity", "songs", "20261006020000_shared_edit_requests_song_ownership.sql"],
  ["Creators and owners admins edit songs", "songs", "20261006020000_shared_edit_requests_song_ownership.sql"],
  ["Requester and owners admins read legacy song edits", "song_edit_requests", "20261006020000_shared_edit_requests_song_ownership.sql"],
  ["Revoked managers cannot read others join requests", "join_requests", "20261008020000_owner_permission_overrides.sql"],
  ["Delegated managers review pending join requests", "join_requests", "20261008020000_owner_permission_overrides.sql"],
];
function conditions(statement: string) {
  return statement.slice(statement.search(/\busing\s*\(|\bwith check\s*\(/i)).replace(/\s/g, "");
}

describe("website policy identity initplans", () => {
  it.each(policies)("preserves every access condition in %s", (name, table, sourceFile) => {
    const source = readFileSync(`supabase/migrations/${sourceFile}`, "utf8");
    const original = source.match(new RegExp(`create policy "${name}" on public\\.${table}[^;]+;`, "i"))?.[0];
    const revised = correction.match(new RegExp(`alter policy "${name}" on public\\.${table}[^;]+;`, "i"))?.[0];
    expect(original).toBeDefined();
    expect(revised).toBeDefined();
    expect(conditions(revised!)).toBe(conditions(original!).replaceAll("auth.uid()", "(selectauth.uid())"));
  });
  it("retains policy scope, commands, grants and restrictive behavior", () => {
    expect(correction.match(/alter policy /g)).toHaveLength(6);
    expect(correction.match(/\(select auth\.uid\(\)\)/g)).toHaveLength(7);
    expect(correction).not.toMatch(/\b(?:create|drop)\s+policy|\b(?:grant|revoke)\s|\bto\s+authenticated/i);
    expect(correction.trim()).toMatch(/commit;$/);
  });
});
