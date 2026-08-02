import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { safeErrorDetails } from "@/lib/server/safe-error";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  strategy: "distributed" | "local-fallback" | "fail-closed";
}

const localStore = new Map<string, number[]>();
const distributedLimiters = new Map<string, Ratelimit>();

function hasDistributedRateLimitEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function isProductionRuntime() {
  return process.env.VERCEL_ENV === "production";
}

function failClosed(windowMs: number): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    resetAt: Date.now() + windowMs,
    strategy: "fail-closed",
  };
}

function localRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (localStore.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
  const allowed = timestamps.length < max;

  if (allowed) {
    timestamps.push(now);
  }

  if (timestamps.length > 0) {
    localStore.set(key, timestamps);
  } else {
    localStore.delete(key);
  }

  return {
    allowed,
    remaining: Math.max(0, max - timestamps.length),
    resetAt: (timestamps[0] ?? now) + windowMs,
    strategy: "local-fallback",
  };
}

function getDistributedLimiter(max: number, windowMs: number) {
  const limiterKey = `${max}:${windowMs}`;
  const existing = distributedLimiters.get(limiterKey);
  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
    prefix: `anointed-worship:rate-limit:${limiterKey}`,
    timeout: 1_000,
    analytics: false,
  });
  distributedLimiters.set(limiterKey, limiter);
  return limiter;
}

/**
 * Applies an atomic shared sliding-window limit when Upstash is configured.
 * Local/demo environments retain an in-process fallback so development does
 * not depend on an external service.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  if (!hasDistributedRateLimitEnv()) {
    if (isProductionRuntime()) {
      return failClosed(windowMs);
    }
    return localRateLimit(key, max, windowMs);
  }

  try {
    const result = await getDistributedLimiter(max, windowMs).limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
      strategy: "distributed",
    };
  } catch (error) {
    console.error(
      "Distributed rate limit check failed; using local fallback.",
      safeErrorDetails(error),
    );
    return isProductionRuntime()
      ? failClosed(windowMs)
      : localRateLimit(key, max, windowMs);
  }
}
