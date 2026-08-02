import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstashMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  fromEnv: vi.fn(() => ({ kind: "redis" })),
  limit: vi.fn(),
  slidingWindow: vi.fn(() => ({ kind: "window" })),
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: upstashMocks.fromEnv },
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = upstashMocks.slidingWindow;

    constructor(options: unknown) {
      upstashMocks.constructor(options);
    }

    limit(key: string) {
      return upstashMocks.limit(key);
    }
  },
}));

import { rateLimit } from "@/lib/rate-limit";

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("rateLimit local fallback", () => {
  beforeEach(() => {
    upstashMocks.constructor.mockClear();
    upstashMocks.fromEnv.mockClear();
    upstashMocks.limit.mockReset();
    upstashMocks.slidingWindow.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:00:00Z"));
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    restoreEnvironment("UPSTASH_REDIS_REST_URL", originalUrl);
    restoreEnvironment("UPSTASH_REDIS_REST_TOKEN", originalToken);
  });

  it("blocks requests beyond the configured window budget", async () => {
    const key = `test-budget-${crypto.randomUUID()}`;

    expect(await rateLimit(key, 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
      strategy: "local-fallback",
    });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(await rateLimit(key, 2, 1_000)).toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it("allows requests again after the sliding window expires", async () => {
    const key = `test-expiry-${crypto.randomUUID()}`;

    expect((await rateLimit(key, 1, 1_000)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 1_000)).allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(await rateLimit(key, 1, 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it("uses the shared distributed limiter when Upstash is configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    upstashMocks.limit
      .mockResolvedValueOnce({ success: true, remaining: 4, reset: 12345 })
      .mockResolvedValueOnce({ success: false, remaining: 0, reset: 12345 });

    await expect(rateLimit("distributed-1", 5, 2_345)).resolves.toEqual({
      allowed: true,
      remaining: 4,
      resetAt: 12345,
      strategy: "distributed",
    });
    await expect(rateLimit("distributed-2", 5, 2_345)).resolves.toMatchObject({
      allowed: false,
      strategy: "distributed",
    });

    expect(upstashMocks.constructor).toHaveBeenCalledTimes(1);
    expect(upstashMocks.slidingWindow).toHaveBeenCalledWith(5, "2345 ms");
  });

  it("falls back locally when the distributed limiter fails", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    upstashMocks.limit.mockRejectedValueOnce(new Error("redis unavailable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(rateLimit("distributed-failure", 1, 3_456)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      strategy: "local-fallback",
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("fails closed in production when distributed limiting is unavailable", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    await expect(rateLimit("production-missing", 5, 10_000)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      strategy: "fail-closed",
    });
  });
});
