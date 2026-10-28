// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { readMobileWorkspaces, readSelectedWorkspace } from "./workspaces";

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const userId = id(1);
const member = (team = 2) => ({ id: id(team + 200), team_id: id(team), profile_id: userId, role: "member", status: "active", custom_role_id: null, custom_roles: null, teams: { name: `Team ${team}` } });
type Reply = { data: unknown; status?: number };
function database(reply: (url: URL) => Reply) {
  const urls: URL[] = [];
  const client = createClient<Database>("https://test.supabase.co", "publishable-test-key", {
    auth: { persistSession: false }, global: { fetch: async input => {
      const url = new URL(String(input));
      urls.push(url);
      const result = reply(url);
      return new Response(JSON.stringify(result.data), { status: result.status ?? 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, userId, urls };
}
function replies(rows: unknown[], extra: { pending?: unknown; overrides?: unknown } = {}) {
  return (url: URL): Reply => {
    const data = url.pathname.endsWith('team_members') ? rows : url.pathname.endsWith('join_requests') ? extra.pending ?? [] : extra.overrides ?? [];
    if (!Array.isArray(data)) return {data};
    const key = url.pathname.endsWith('team_members') ? 'team_id' : 'id';
    const cursor = url.searchParams.get(key)?.replace(/^gt\./,'');
    return {data:data.filter(row=>!cursor || row[key]>cursor).slice(0,Number(url.searchParams.get('limit')??data.length))};
  };
}
describe("v2 active workspace reads", () => {
  it("pins profile/status, reads only safe team fields, and returns pending join state", async () => {
    const db = database(replies([member()], { pending: [{ id: id(5) }] }));
    const response = await readMobileWorkspaces({ ...db, input: { version: 2 } });
    expect(response).toMatchObject({ version: 2, userId, pendingJoin: true, nextId: null, memberships: [{ teamId: id(2), memberId: id(202), teamName: "Team 2" }] });
    const query = db.urls[0].searchParams;
    expect(query.get("profile_id")).toBe(`eq.${userId}`);
    expect(query.get("status")).toBe("eq.active");
    expect(query.get("order")).toBe("team_id.asc");
    expect(query.get("limit")).toBe("51");
    expect(query.get("select")).not.toMatch(/code|provider|secret/);
    const pending = db.urls.find(url => url.pathname.endsWith("join_requests"));
    expect(pending?.searchParams.get("profile_id")).toBe(`eq.${userId}`);
    expect(pending?.searchParams.get("status")).toBe("eq.pending");
    expect(db.urls.at(-1)?.searchParams.get("team_id")).toBe(`in.(${id(2)})`);
  });
  it("enumerates more than one page with team UUID keysets and a 51st-row probe", async () => {
    const rows = Array.from({ length: 65 }, (_, index) => member(index + 10));
    const db = database(url => {
      const cursor = url.searchParams.get("team_id")?.replace("gt.", "");
      return { data: url.pathname.endsWith("team_members") ? rows.filter(row => !cursor || row.team_id > cursor).slice(0, 51) : [] };
    });
    const first = await readMobileWorkspaces({ ...db, input: { version: 2 } });
    const second = await readMobileWorkspaces({ ...db, input: { version: 2, after: first.nextId ?? undefined } });
    expect(first.memberships).toHaveLength(50);
    expect(first.nextId).toBe(id(59));
    expect(second.memberships).toHaveLength(15);
    expect(second.nextId).toBeNull();
    expect(new Set([...first.memberships, ...second.memberships].map(row => row.teamId)).size).toBe(65);
    expect(db.urls.filter(url => url.pathname.endsWith("team_members"))[1].searchParams.get("team_id")).toBe(`gt.${id(59)}`);
  });
  it("accepts no-team users and exact full final pages without claiming another page", async () => {
    const empty = database(replies([]));
    expect(await readMobileWorkspaces({ ...empty, input: { version: 2 } })).toEqual({ version: 2, userId, memberships: [], pendingJoin: false, nextId: null });
    const full = database(replies(Array.from({ length: 50 }, (_, index) => member(index + 10))));
    expect((await readMobileWorkspaces({ ...full, input: { version: 2 } })).nextId).toBeNull();
  });
  it("reuses person-over-role overrides and keeps custom role permissions within their workspace", async () => {
    const custom = { ...member(), custom_role_id: id(90), custom_roles: { id: id(90), team_id: id(2), permissions: ["events.manage"] } };
    const db = database(replies([custom, member(3)], { overrides: [
      { id: id(1100), team_id: id(2), role: "member", member_id: null, permission: "files.upload", allowed: true },
      { id: id(1101), team_id: id(2), role: null, member_id: id(202), permission: "files.upload", allowed: false },
    ] }));
    const response = await readMobileWorkspaces({ ...db, input: { version: 2 } });
    expect(response.memberships[0].permissions).toContain("events.manage");
    expect(response.memberships[0].permissions).not.toContain("files.upload");
    expect(response.memberships[1].permissions).not.toContain("events.manage");
  });
  it("pages permission overrides so a later person deny is never truncated", async () => {
    const members = Array.from({ length: 30 }, (_, index) => member(index + 10));
    const overrides = [
      ...members.map((row, index) => ({ id: id(index + 1000), team_id: row.team_id, role: "member", member_id: null, permission: "files.upload", allowed: true })),
      ...members.map((row, index) => ({ id: id(index + 1100), team_id: row.team_id, role: null, member_id: row.id, permission: "files.upload", allowed: false })),
    ];
    const db = database(url => {
      if (!url.pathname.endsWith("team_permission_overrides")) return replies(members)(url);
      const after = url.searchParams.get("id")?.replace("gt.", "");
      return { data: overrides.filter(row => !after || row.id > after).slice(0, 51) };
    });
    const response = await readMobileWorkspaces({ ...db, input: { version: 2 } });
    expect(response.memberships.every(row => !row.permissions.includes("files.upload"))).toBe(true);
    const requests = db.urls.filter(url => url.pathname.endsWith("team_permission_overrides"));
    expect(requests).toHaveLength(3);
    expect(requests[0].searchParams.get("or")).toContain("role.in.(member)");
    expect(requests[1].searchParams.get("id")).toBe(`gt.${id(1120)}`);
    expect(requests[2].searchParams.get("id")).toBe(`gt.${id(1129)}`);
  });
  it.each([null, { id: id(90), team_id: id(99), permissions: ["team.manage"] }])("denies missing or foreign custom roles %o", async custom_roles => {
    const db = database(replies([{ ...member(), custom_role_id: id(90), custom_roles }]));
    await expect(readMobileWorkspaces({ ...db, input: { version: 2 } })).rejects.toMatchObject({ status: 403, code: "membership" });
  });
  it.each(["team_members", "join_requests", "team_permission_overrides"])("surfaces %s read failures rather than empty state", async table => {
    const db = database(url => url.pathname.endsWith(table) ? { data: { code: "42501", message: "secret SQL" }, status: 403 } : replies([member()])(url));
    await expect(readMobileWorkspaces({ ...db, input: { version: 2 } })).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
  it.each([
    { rows: [{ ...member(), profile_id: id(99) }] }, { rows: [{ ...member(), status: "removed" }] }, { rows: [member(), member()] },
    { rows: [{ ...member(), custom_role_id: id(90), custom_roles: { id: id(90), team_id: id(2), permissions: ["unknown.permission"] } }] },
  ])("fails closed on malformed, foreign, removed or duplicated rows", async ({ rows }) => {
    const db = database(replies(rows));
    await expect(readMobileWorkspaces({ ...db, input: { version: 2 } })).rejects.toMatchObject({ status: 503 });
  });
  it("selects only the explicit active team and rejects a removed membership", async () => {
    const db = database(url => ({ data: url.pathname.endsWith("team_members") ? member(22) : [] }));
    expect((await readSelectedWorkspace({ ...db, teamId: id(22) })).teamId).toBe(id(22));
    expect(db.urls[0].searchParams.get("team_id")).toBe(`eq.${id(22)}`);
    expect(db.urls[0].searchParams.get("profile_id")).toBe(`eq.${userId}`);
    expect(db.urls[0].searchParams.get("status")).toBe("eq.active");
    const removed = database(() => ({ data: null }));
    await expect(readSelectedWorkspace({ ...removed, teamId: id(22) })).rejects.toMatchObject({ status: 403, code: "membership" });
  });
});
