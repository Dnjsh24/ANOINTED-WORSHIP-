import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), url: "https://fbrmotzjsnmdpdkcxyqb.supabase.co", configured: true }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => mocks.configured, getSupabaseEnv: () => ({ url: mocks.url }) }));
vi.mock("@/lib/supabase/team-context", () => ({ getCurrentTeamContext: mocks.context }));
import { GET } from "./route";

describe("isolated capacity admission", () => {
  beforeEach(() => {
    vi.stubEnv("CAPACITY_TEST_ENABLED", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://isolated-redis.upstash.io");
    vi.stubEnv("CAPACITY_TEST_REDIS_REST_URL", "https://isolated-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-placeholder-token");
    mocks.url = "https://fbrmotzjsnmdpdkcxyqb.supabase.co";
    mocks.configured = true;
    mocks.context.mockReset().mockResolvedValue({ userId: "verified-account", teamId: "test-team", memberId: "test-member" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses production, ordinary previews and missing backend configuration", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await GET()).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("CAPACITY_TEST_ENABLED", "0");
    expect((await GET()).status).toBe(404);
    vi.stubEnv("CAPACITY_TEST_ENABLED", "1");
    mocks.configured = false;
    expect((await GET()).status).toBe(404);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("refuses production or other database origins before authenticating", async () => {
    for (const url of ["https://xvrndwkghxkqsvxxtqym.supabase.co", "https://unapproved.supabase.co"]) {
      mocks.url = url;
      expect((await GET()).status).toBe(503);
    }
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("requires active server-confirmed identity and returns uncached isolation proof", async () => {
    mocks.context.mockResolvedValueOnce({ userId: "account", teamId: null, memberId: null });
    expect((await GET()).status).toBe(401);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ mode: "isolated-free-preview", commit: "a".repeat(40), supabaseOrigin: mocks.url, redisOrigin: "https://isolated-redis.upstash.io", userId: "verified-account", teamId: "test-team", status: "active" });
  });
  it("refuses missing or mismatched Redis test configuration", async () => {
    vi.stubEnv("CAPACITY_TEST_REDIS_REST_URL", undefined);
    expect((await GET()).status).toBe(503);
    vi.stubEnv("CAPACITY_TEST_REDIS_REST_URL", "https://different-redis.upstash.io");
    expect((await GET()).status).toBe(503);
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
