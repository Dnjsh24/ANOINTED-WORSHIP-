// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "./route";
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const userId = id(1);
function request(body: unknown = { version: 2 }, headers: HeadersInit = {}) {
  return new Request("https://website.example/api/mobile/v2/workspaces", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "capacitor://localhost", authorization: "Bearer header.payload.signature", "x-mobile-user-id": userId, ...headers }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("E2E_FORCE_DEMO", "0");
  vi.stubEnv("NEXT_PUBLIC_E2E_FORCE_DEMO", "0");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function authAndEmptyMemberships() {
  const fetch = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith("/user") ? { id: userId } : []));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("v2 workspaces HTTP boundary with real Supabase SDK", () => {
  it("supports no-team verified users, pins their ID, and returns no-store CORS", async () => {
    authAndEmptyMemberships();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 2, userId, memberships: [], nextId: null, pendingJoin: false });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
  it("returns version2 account-pin errors before any team lookup", async () => {
    const fetch = authAndEmptyMemberships();
    const response = await POST(request(undefined, { "x-mobile-user-id": id(99) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "scope_changed" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ version: 1 }, { version: 2, after: "invalid" }, { version: 2, teamId: id(99) }])("rejects invalid or caller-owned scope input %o", async body => {
    const fetch = authAndEmptyMemberships();
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "validation" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized input with a version2 error", async () => {
    authAndEmptyMemberships();
    const response = await POST(request({ version: 2, after: "x".repeat(5000) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "body" } });
  });
  it("checks origin before Auth and returns version2 errors", async () => {
    const fetch = authAndEmptyMemberships();
    const response = await POST(request(undefined, { Origin: "https://attacker.example" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "origin" } });
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("permits native preflight without Auth", async () => {
    const fetch = authAndEmptyMemberships();
    const response = await OPTIONS(new Request("https://website.example/api/mobile/v2/workspaces", { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Mobile-User-Id");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never maps a denied team read into an empty workspace list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/user")
      ? Response.json({ id: userId }) : Response.json({ code: "42501", message: "private SQL" }, { status: 403 })));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ version: 2, error: { code: "unavailable", message: "Workspaces are unavailable. Try again later." } });
  });
});
