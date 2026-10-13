// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const original = readFileSync("supabase/migrations/20261006010000_atomic_event_setlist_workflows.sql", "utf8").replace(/\r\n/g, "\n");
const correction = readFileSync("supabase/migrations/20261012010000_website_function_lint.sql", "utf8").replace(/\r\n/g, "\n");

describe("forward website function lint correction", () => {
  it.each(["save_event_workspace", "save_setlist_workspace"])("preserves every statement, signature and security option of %s", (name) => {
    const start = original.indexOf(`create function public.${name}(`);
    const end = original.indexOf("\n$$;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const expected = original.slice(start, end + 4)
      .replace("create function", "create or replace function")
      .replace("  v_index integer;\n", "");
    expect(correction).toContain(expected);
  });

  it("changes only membership helper volatility and the two unused counter declarations", () => {
    expect(correction).toContain("alter function private.is_approved_member(uuid) stable;");
    expect(correction).toContain("alter function private.has_team_role(uuid, public.team_role[]) stable;");
    expect(correction.match(/create or replace function/g)).toHaveLength(2);
    expect(correction).not.toMatch(/\b(?:grant|revoke|drop|disable)\s/i);
    expect(correction).not.toContain("v_index integer;");
    expect(correction).toMatch(/\bbegin;/i);
    expect(correction.trim()).toMatch(/commit;$/i);
  });
});
