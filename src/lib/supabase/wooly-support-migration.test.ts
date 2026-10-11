import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261011020000_wooly_chat_support.sql", "utf8");
describe("Wooly support migration security contract (source checks)", () => {
  it("enables RLS on all four tables and provides no client role grants or direct writes", () => {
    for (const name of ["accounts", "requests", "messages"]) expect(sql).toContain(`alter table public.wooly_support_${name} enable row level security`);
    expect(sql).toContain("alter table public.wooly_help_articles enable row level security");
    expect(sql).not.toMatch(/grant (?:all|insert|update|delete)[^;]+to (?:authenticated|anon)/i);
    expect(sql).not.toMatch(/insert into public\.wooly_support_accounts/);
    expect(sql).not.toMatch(/create policy[^;]+for (?:insert|update|delete)/i);
  });
  it("uses a dedicated support grant, owner-scoped requests/messages and no record-table privileges", () => {
    expect(sql).toContain("where profile_id = (select auth.uid())");
    expect(sql).toContain("r.profile_id = (select auth.uid())");
    expect(sql).toContain("private.is_approved_member(p_team_id)");
    expect(sql).not.toMatch(/(?:grant|create policy|alter table)[^;]+public\.(?:songs|events|setlists|team_members)/i);
  });
  it("validates writes, serializes retries and preserves private answers until publication", () => {
    expect(sql).toContain("Request identity conflict");
    expect(sql).toContain("Message identity conflict");
    expect(sql).toContain("for update");
    expect(sql).toContain("published boolean not null default false");
    expect(sql).toContain("using (published and audience = 'everyone')");
    expect(sql).toContain("status = case when p_as_support then 'answered' else 'open' end");
    expect(sql).toContain("least(p_read_until,clock_timestamp())");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("char_length(btrim(body)) between 1 and 5000");
  });
  it("fixes every definer search path and revokes public RPC execution", () => {
    const functions = sql.match(/create function[\s\S]*?\$\$;/g) ?? [];
    expect(functions.length).toBe(8);
    for (const definition of functions) expect(definition).toContain("set search_path = ''");
    expect(functions.filter((definition) => definition.includes("security definer"))).toHaveLength(7);
    expect(sql).toContain("where profile_id = (select auth.uid()) and support_updated_at > requester_read_at");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to authenticated;\ncommit;");
  });
});
