import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), limit: vi.fn(), cookies: false, desktop: false }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => mocks.desktop }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true, getSupabaseEnv: () => ({ url: "https://example.supabase.co", publishableKey: "test" }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => void } }) => ({
    auth: { getUser: () => {
      if (mocks.cookies) {
        options.cookies.setAll([{ name: "refreshed", value: "signed-session", options: { httpOnly: true, sameSite: "lax", secure: true } }]);
        options.cookies.setAll([{ name: "second", value: "value", options: { httpOnly: true } }]);
      }
      return mocks.getUser();
    } },
  }),
}));

import { RATE_LIMITS, updateSession } from "@/lib/supabase/proxy";

const request = (path = "/dashboard", headers: Record<string, string> = {}) => new NextRequest(`https://app.example${path}`, { headers: { "x-vercel-forwarded-for": "203.0.113.1", ...headers } });

describe("verified users sharing venue WiFi", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_FORCE_DEMO", "0");
    mocks.cookies = false;
    mocks.desktop = false;
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "verified-1" } }, error: null });
    mocks.limit.mockReset().mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("supports a 199-user API burst behind one IP with independent user enforcement", async () => {
    const counts = new Map<string, number>();
    mocks.limit.mockImplementation(async (key: string, max: number) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { allowed: count <= max, resetAt: Date.now() + 60_000 };
    });
    for (let user = 0; user < 199; user++) {
      mocks.getUser.mockResolvedValue({ data: { user: { id: `verified-${user}` } }, error: null });
      for (let navigation = 0; navigation < 8; navigation++) expect((await updateSession(request("/api/bible"))).status).toBe(200);
    }
    expect(counts.get("ip:api:203.0.113.1")).toBe(1592);
    expect(counts.get("user:verified-0:api")).toBe(8);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-0" } }, error: null });
    for (let n = 8; n < RATE_LIMITS.userApi.max; n++) expect((await updateSession(request("/api/bible"))).status).toBe(200);
    expect((await updateSession(request("/api/bible"))).status).toBe(429);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "another-user" } }, error: null });
    expect((await updateSession(request("/api/bible"))).status).toBe(200);
  });

  it("rejects aggregate abuse before calling Auth and retains CSP/retry headers", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, resetAt: Date.now() + 60_000 });
    const response = await updateSession(request());
    expect(response.status).toBe(429);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("ignores unsigned cookies and caller identity headers when selecting the anonymous budget", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await updateSession(request("/api/bible", { cookie: "userId=forged; sb-session=unsigned", "x-user-id": "forged", authorization: "Bearer unsigned" }));
    expect(mocks.limit).toHaveBeenLastCalledWith("anonymous:203.0.113.1:api", RATE_LIMITS.anonymousApi.max, 60_000);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "unverified" } }, error: new Error("Rejected token") });
    await updateSession(request());
    expect(mocks.limit).toHaveBeenLastCalledWith("anonymous:203.0.113.1:general", RATE_LIMITS.anonymousGeneral.max, 60_000);
  });

  it("keeps prefixed auth routes on their strict IP budget", async () => {
    await updateSession(request("/services/anointed-worship-app/auth/callback"));
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith("ip:auth:203.0.113.1", 10, 60_000);
  });

  it("preserves offline desktop navigation without Redis or cloud Auth in production", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    mocks.desktop = true;
    mocks.limit.mockRejectedValue(new Error("Offline"));
    mocks.getUser.mockRejectedValue(new Error("Offline"));
    const response = await updateSession(request());
    expect(response.status).toBe(200);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(response.headers.get("content-security-policy")).toContain("nonce-");
  });

  it("bounds venue sign-in completions separately without widening malformed auth routes", async () => {
    const counts = new Map<string, number>();
    mocks.limit.mockImplementation(async (key: string, max: number) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { allowed: count <= max, resetAt: Date.now() + 60_000 };
    });
    for (let index = 0; index < 200; index++) {
      const path = index % 2 ? "/auth/confirm?token_hash=one-time&type=email" : "/services/anointed-worship-app/auth/callback?code=one-time";
      expect((await updateSession(request(path))).status).toBe(200);
    }
    expect((await updateSession(request("/auth/callback?code=one-time"))).status).toBe(429);
    expect(counts.get("ip:auth-completion:203.0.113.1")).toBe(201);
    for (const path of ["/auth/callback", "/auth/confirm?token_hash=x&type=invalid", "/auth/other?code=x"]) {
      await updateSession(request(path));
      expect(mocks.limit).toHaveBeenLastCalledWith("ip:auth:203.0.113.1", 10, 60_000);
    }
  });

  it("forwards refreshed cookies and CSP through rewrites and login redirects", async () => {
    mocks.cookies = true;
    let response = await updateSession(request("/services/anointed-worship-app/dashboard"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://app.example/dashboard");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("refreshed=signed-session");
    expect(response.cookies.get("refreshed")).toMatchObject({ value: "signed-session", httpOnly: true, secure: true });
    expect(response.cookies.get("second")?.value).toBe("value");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    response = await updateSession(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example/login");
    expect(response.cookies.get("refreshed")?.value).toBe("signed-session");
    expect(response.headers.get("content-security-policy")).toContain("nonce-");
  });

  it("retains session cookies when the authenticated user budget rejects a request", async () => {
    mocks.cookies = true;
    mocks.limit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, resetAt: Date.now() + 60_000 });
    const response = await updateSession(request());
    expect(response.status).toBe(429);
    expect(response.cookies.get("refreshed")?.value).toBe("signed-session");
  });
});
