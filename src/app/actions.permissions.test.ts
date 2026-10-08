import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), revalidate: vi.fn(), role: "owner", conflict: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true, getSiteUrl: () => "http://localhost" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
vi.mock("@/lib/desktop/workspace", () => ({}));
vi.mock("@/lib/desktop/sync", () => ({}));
vi.mock("@/lib/push-notifications", () => ({ notifyProfiles: vi.fn() }));
vi.mock("@/lib/domain/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/supabase/team-context", () => ({ getCurrentTeamContext: vi.fn(), getCurrentTeamContextForClient: vi.fn() }));
import { inviteMemberAction, regenerateTeamCodeAction, setTeamPermissionOverrideAction, updateMemberRoleAction } from "./actions";
const teamId = "11111111-1111-4111-8111-111111111111", memberId = "22222222-2222-4222-8222-222222222222", actorId = "33333333-3333-4333-8333-333333333333";
const dataForm = (values: Record<string, string>) => { const form = new FormData(); Object.entries(values).forEach(([key, value]) => form.set(key, value)); return form; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.role = "owner"; mocks.conflict = false;
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: actorId } } }) }, rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "team_permission_overrides") return { select: () => ({ eq: async () => ({ data: [{ role: "member", member_id: null, permission: "members.manage", allowed: true }], error: null }) }) };
      let writing = false;
      const query = { select: () => query, eq: (key: string, value: unknown) => { mocks.eq(table, key, value); return query; }, order: () => query, limit: () => query,
        update: (values: unknown) => { writing = true; mocks.update(values); return query; }, insert: mocks.insert,
        maybeSingle: async () => ({ data: { id: memberId, team_id: teamId, role: mocks.role, status: "active", custom_roles: null }, error: null }),
        single: async () => ({ data: writing ? (mocks.conflict ? null : { code: mocks.update.mock.calls.at(-1)?.[0].code }) : { name: "Current team", code: "CT-12345" }, error: null }),
      };
      return query;
    },
  });
});
it("sends an owner's per-person override to the team-scoped RPC", async () => {
  const form = dataForm({ teamId, targetKind: "person", memberId, permission: "events.manage", value: "deny" });
  expect(await setTeamPermissionOverrideAction({ ok: false, message: "" }, form)).toMatchObject({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("set_team_permission_override", { p_team_id: teamId, p_role: null, p_member_id: memberId, p_permission: "events.manage", p_allowed: false });
  expect(mocks.eq).toHaveBeenCalledWith("team_members", "team_id", teamId);
});
it("denies non-owner permission changes and protected owner role targets", async () => {
  mocks.role = "admin";
  expect(await setTeamPermissionOverrideAction({ ok: false, message: "" }, dataForm({ teamId, targetKind: "role", role: "member", permission: "events.manage", value: "allow" }))).toMatchObject({ ok: false });
  mocks.role = "owner";
  expect(await setTeamPermissionOverrideAction({ ok: false, message: "" }, dataForm({ teamId, targetKind: "role", role: "owner", permission: "events.manage", value: "deny" }))).toMatchObject({ ok: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["admin", "worship_leader", "band_leader"])("denies delegated %s invitations and role changes before writing", async role => {
  mocks.role = "member";
  expect(await inviteMemberAction({ ok: false, message: "" }, dataForm({ email: "new@example.test", role, message: "" }))).toMatchObject({ ok: false, message: expect.stringContaining("Privileged invitations") });
  expect(await updateMemberRoleAction({ ok: false, message: "" }, dataForm({ memberId, role: "admin" }))).toMatchObject({ ok: false, message: expect.stringContaining("Role assignment") });
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("persists a different invitation code with a comparison against the old code", async () => {
  expect(await regenerateTeamCodeAction()).toMatchObject({ ok: true });
  expect(mocks.update).toHaveBeenCalledWith({ code: expect.any(String) });
  expect(mocks.update.mock.calls[0][0].code).not.toBe("CT-12345");
  expect(mocks.eq).toHaveBeenCalledWith("teams", "id", teamId);
  expect(mocks.eq).toHaveBeenCalledWith("teams", "code", "CT-12345");
  expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
});
it("does not report success or refresh after a concurrent code change", async () => {
  mocks.conflict = true;
  expect(await regenerateTeamCodeAction()).toMatchObject({ ok: false });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
