import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ env: vi.fn(), create: vi.fn(), context: vi.fn(), rate: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: mocks.env }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
vi.mock("@/lib/supabase/team-context", () => ({ getCurrentTeamContextForClient: mocks.context }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rate }));
import { requireWoolyAccount, requireWoolySupport, woolyServerContext } from "./wooly-context";
beforeEach(() => { vi.resetAllMocks(); mocks.env.mockReturnValue(true); mocks.create.mockResolvedValue({ rpc: mocks.rpc }); mocks.context.mockResolvedValue({ userId: "verified", teamId: "team-a", role: "member", permissionOverrides: { "songs.edit": true }, customPermissions: [], canManageMembers: false }); mocks.rate.mockResolvedValue({ allowed: true }); mocks.rpc.mockResolvedValue({ data: false, error: null }); });
describe("Wooly verified identity and support grants", () => {
  it("returns demo only when environment is unconfigured", async () => { mocks.env.mockReturnValue(false); expect(await woolyServerContext()).toBeNull(); expect(mocks.create).not.toHaveBeenCalled(); });
  it("derives audience from fresh verified context and effective permissions", async () => {
    const session = await woolyServerContext();
    expect(session?.audience).toMatchObject({ userId: "verified", teamId: "team-a", hasTeam: true, canManageMembers: false, permissions: ["songs.create", "songs.edit", "attendance.confirm", "messages.send", "prayer_requests.create"], session: "account" });
    expect(mocks.context).toHaveBeenCalledWith(await mocks.create.mock.results[0].value);
  });
  it("rejects unauthenticated and missing-environment support access", async () => {
    mocks.context.mockResolvedValue({ userId: null, teamId: null, role: "member", canManageMembers: false });
    expect((await woolyServerContext())?.audience.session).toBe("guest");
    await expect(requireWoolyAccount("submit")).rejects.toThrow("Sign in");
    mocks.env.mockReturnValue(false); await expect(requireWoolySupport()).rejects.toThrow("Sign in");
  });
  it("uses existing rate limiting with verified identity", async () => {
    await requireWoolyAccount("submit", 5); expect(mocks.rate).toHaveBeenCalledWith("wooly:submit:verified", 5, 60_000);
    mocks.rate.mockResolvedValue({ allowed: false }); await expect(requireWoolyAccount("submit")).rejects.toThrow("wait a minute");
  });
  it("does not treat team admin as website support", async () => {
    await expect(requireWoolySupport()).rejects.toThrow("support access");
    mocks.rpc.mockResolvedValue({ data: true, error: {} }); await expect(requireWoolySupport()).rejects.toThrow("support access");
    mocks.rpc.mockResolvedValue({ data: true, error: null }); await expect(requireWoolySupport()).resolves.toMatchObject({ context: { userId: "verified" } });
  });
});
