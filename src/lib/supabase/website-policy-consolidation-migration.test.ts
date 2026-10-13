// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const correction = readFileSync("supabase/migrations/20261012030000_website_policy_consolidation.sql", "utf8");
const permissionSource = "20261008020000_owner_permission_overrides.sql";
const identitySource = "20261012020000_website_policy_identity_initplan.sql";
const groups = [
  [
    "teams",
    "Owners and admins can update teams",
    "20260630010000_anointed_worship_mvp.sql",
    "Delegated settings update team"
  ],
  [
    "join_requests",
    "Users and admins can view join requests",
    "20260630010000_anointed_worship_mvp.sql",
    "Delegated managers read join requests"
  ],
  [
    "songs",
    "Creators and owners admins edit songs",
    "20261012020000_website_policy_identity_initplan.sql",
    "Delegated editors update songs"
  ],
  [
    "team_settings",
    "Owners and admins can manage team settings",
    "20260630030000_interaction_mvp_persistence.sql",
    "Delegated settings manage defaults"
  ],
  [
    "profiles",
    "Authorized users can view profiles",
    "20260802020000_consolidate_website_rls_policies.sql",
    "Delegated managers read pending requester profiles"
  ],
  [
    "team_members",
    "Owners and admins can update team members",
    "20260802030000_enforce_website_integrity.sql",
    "Delegated members update roster"
  ],
  [
    "team_members",
    "Authorized users can delete non-owner members",
    "20260802030000_enforce_website_integrity.sql",
    "Delegated members remove non-owner roster"
  ],
  [
    "team_members",
    "Authorized users can insert non-owner members",
    "20260802030000_enforce_website_integrity.sql",
    "Delegated members add non-owner roster"
  ],
  [
    "join_requests",
    "Authorized users can update pending join requests",
    "20260802030000_enforce_website_integrity.sql",
    "Delegated managers review pending join requests"
  ]
];

function statement(sourceFile: string, name: string, table: string) {
  const source = readFileSync("supabase/migrations/" + sourceFile, "utf8");
  const match = source.match(new RegExp('(?:create|alter) policy "' + name + '"\\s+on\\s+public\\.' + table + '[^;]+;', "i"));
  if (!match) throw new Error("Missing source policy: " + name);
  return match[0];
}
function clauses(sql: string) {
  const usingStart = sql.search(/\busing\s*\(/i);
  const checkStart = sql.search(/\bwith check\s*\(/i);
  return {
    using: usingStart < 0 ? null : sql.slice(usingStart, checkStart < 0 ? -1 : checkStart).replace(/^using\s*/i, "").trim(),
    check: checkStart < 0 ? null : sql.slice(checkStart, -1).replace(/^with check\s*/i, "").trim(),
  };
}
const normalize = (sql: string | null) => sql?.replace(/\s/g, "");

// Permissive old-row and new-row predicates combine independently.
// PostgreSQL uses USING when a write policy omits WITH CHECK.
function combinedClauses(left: ReturnType<typeof clauses>, right: ReturnType<typeof clauses>) {
  return {
    using: left.using || right.using ? "(" + (left.using ?? "(true)") + " or " + (right.using ?? "(true)") + ")" : null,
    check: left.check || right.check ? "(" + (left.check ?? left.using ?? "(true)") + " or " + (right.check ?? right.using ?? "(true)") + ")" : null,
  };
}

describe("website permissive policy consolidation", () => {
  it.each(groups)("preserves the exact OR conditions for %s / %s", (table, retained, sourceFile, removed) => {
    const removedSource = removed === "Delegated managers review pending join requests" ? identitySource : permissionSource;
    const expected = combinedClauses(clauses(statement(sourceFile, retained, table)), clauses(statement(removedSource, removed, table)));
    const revised = correction.match(new RegExp('alter policy "' + retained + '" on public\\.' + table + '[^;]+;', "i"))?.[0];
    if (!revised) throw new Error("Missing consolidated policy: " + retained);
    const actual = clauses(revised);
    expect(normalize(actual.using)).toBe(normalize(expected.using));
    expect(normalize(actual.check)).toBe(normalize(expected.check));
    expect(revised).not.toMatch(/\bto\b|\brename\b/i);
    expect(correction).toContain('drop policy "' + removed + '" on public.' + table + ';');
  });

  it("retains implicit WITH CHECK fallback instead of substituting unrestricted access", () => {
    const implicit = clauses("create policy example on public.example using (owner_id = (select auth.uid()));");
    const explicit = clauses("create policy delegated on public.example using (can_edit) with check (can_save);");
    expect(combinedClauses(implicit, explicit)).toEqual({
      using: "((owner_id = (select auth.uid())) or (can_edit))",
      check: "((owner_id = (select auth.uid())) or (can_save))",
    });
  });

  it("changes only nine allowlists and removes only their redundant permissive policies", () => {
    expect(correction.match(/alter policy /g)).toHaveLength(9);
    const drops = [...correction.matchAll(/drop policy "([^"]+)" on public\.(\w+);/g)].map((match) => [match[2], match[1]]);
    expect(drops).toEqual(groups.map(([table, , , removed]) => [table, removed]));
    for (const [table, , , removed] of groups) {
      const original = statement(permissionSource, removed, table);
      expect(original).toMatch(/for (?:select|update|insert|delete|all) to authenticated/i);
      expect(original).not.toMatch(/as restrictive/i);
    }
    expect(correction).not.toMatch(/\b(?:create|grant|revoke|disable)\s|\b(?:table|function|trigger)\s|\bas\s+restrictive/i);
    expect(correction).toMatch(/^begin;$/m);
    expect(correction.trim()).toMatch(/commit;$/);
  });
});
