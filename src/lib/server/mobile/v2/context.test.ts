// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMobileUser, requireSelectedWorkspace } from "./context";

const mocks = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit }));
const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const userId = id(1);
const authorization = "Bearer test-token.payload.signature";
const membership = { id: id(3), team_id: id(2), profile_id: userId, role: "member", status: "active", custom_role_id: null, custom_roles: null, teams: { name: "Team" } };
function request(headers: HeadersInit = {}) {
  return new Request("https://website.example/api/mobile/v2/workspaces", { headers: { authorization, "x-mobile-user-id": userId, "x-mobile-team-id": id(2), ...headers } });
}
beforeEach(() => {
  vi.stubEnv("E2E_FORCE_DEMO", "0");
  vi.stubEnv("NEXT_PUBLIC_E2E_FORCE_DEMO", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  mocks.limit.mockReset().mockResolvedValue({ allowed: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("v2 verified account and selected workspace", () => {
  it("verifies Bearer with getUser without requiring any team", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ id: userId }));
    vi.stubGlobal("fetch", fetch);
    const context = await requireMobileUser(request({ "x-mobile-team-id": "" }));
    expect(context.userId).toBe(userId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe("https://test.supabase.co/auth/v1/user");
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe(authorization);
    expect(mocks.limit).toHaveBeenCalledWith(`mobile:v2:${userId}`, 90, 60000);
  });
  it.each(["", id(99), "invalid"])("rejects missing or changed account pin %s before database access", async pin => {
    const fetch = vi.fn(async () => Response.json({ id: userId }));
    vi.stubGlobal("fetch", fetch);
    await expect(requireMobileUser(request({ "x-mobile-user-id": pin }))).rejects.toMatchObject({ status: 409, code: "scope_changed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a missing pin header", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: userId })));
    await expect(requireMobileUser(new Request("https://website.example", { headers: { authorization } }))).rejects.toMatchObject({ status: 409 });
  });
  it.each([{}, { id: "bad" }])("rejects missing or malformed verified user %o", async body => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(requireMobileUser(request())).rejects.toMatchObject({ status: 401, code: "session" });
  });
  it("rejects expired Auth sessions and malformed Bearer before membership reads", async () => {
    const fetch = vi.fn(async () => Response.json({ message: "expired" }, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(requireMobileUser(request())).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    await expect(requireMobileUser(request({ authorization: "Bearer invalid" }))).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a changed workspace pin without loading membership", async () => {
    const fetch = vi.fn(async () => Response.json({ id: userId }));
    vi.stubGlobal("fetch", fetch);
    await expect(requireSelectedWorkspace(request(), id(99))).rejects.toMatchObject({ status: 409, code: "scope_changed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refreshes membership and override permissions on every selected-workspace request", async () => {
    let allowed = true;
    const urls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.endsWith("/user")) return Response.json({ id: userId });
      if (url.pathname.endsWith("team_members")) return Response.json(membership);
      return Response.json(url.searchParams.has('id') ? [] : [{ id: id(10), team_id: id(2), role: "member", member_id: null, permission: "events.manage", allowed }]);
    }));
    expect((await requireSelectedWorkspace(request(), id(2))).identity.permissions).toContain("events.manage");
    allowed = false;
    expect((await requireSelectedWorkspace(request(), id(2))).identity.permissions).not.toContain("events.manage");
    expect(urls.filter(url => url.pathname.endsWith("/user"))).toHaveLength(2);
    expect(urls.filter(url => url.pathname.endsWith("team_members"))).toHaveLength(2);
    expect(urls.filter(url => url.pathname.endsWith("team_permission_overrides"))).toHaveLength(4);
    expect(urls.filter(url => url.pathname.endsWith("team_permission_overrides") && url.searchParams.get('id') === `gt.${id(10)}`)).toHaveLength(2);
  });
  it("returns unavailable for missing configuration and rate-limits verified users", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(requireMobileUser(request())).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: userId })));
    mocks.limit.mockResolvedValue({ allowed: false });
    await expect(requireMobileUser(request())).rejects.toMatchObject({ status: 429 });
  });
});
