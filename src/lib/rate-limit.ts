/**
 * In-memory sliding window rate limiter.
 *
 * Each unique `key` (typically an IP address) gets a list of request
 * timestamps. On every call, timestamps older than `windowMs` are pruned
 * before checking the count. This gives a true sliding window without
 * needing Redis or any external dependency.
 *
 * ⚠️  Limitation: counters are per-process. On multi-instance deployments
 *    (e.g. Vercel serverless) each instance maintains its own counter.
 *    For single-instance hosts (Render) this is fully effective.
 */

interface RateLimitResult {
  /** true when the request is allowed, false when the limit is exceeded */
  allowed: boolean;
  /** how many requests remain in the current window */
  remaining: number;
  /** Unix ms timestamp when the oldest request in the window expires */
  resetAt: number;
}

// Map<key, sorted list of request timestamps (ms)>
const store = new Map<string, number[]>();

// Prune the store every 5 minutes to prevent unbounded memory growth.
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of store.entries()) {
    // Remove entries whose entire window has expired (max window = 60s here).
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 60_000) {
      store.delete(key);
    }
  }
}, PRUNE_INTERVAL_MS);

/**
 * Check and record a rate-limit hit for the given key.
 *
 * @param key      Unique identifier — typically the client IP address.
 * @param max      Maximum number of requests allowed within `windowMs`.
 * @param windowMs Size of the sliding window in milliseconds.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Retrieve or create the timestamp list for this key.
  let timestamps = store.get(key) ?? [];

  // Prune timestamps that have fallen outside the current window.
  timestamps = timestamps.filter((t) => t > windowStart);

  const allowed = timestamps.length < max;

  if (allowed) {
    timestamps.push(now);
  }

  store.set(key, timestamps);

  const oldest = timestamps[0] ?? now;
  const resetAt = oldest + windowMs;
  const remaining = Math.max(0, max - timestamps.length);

  return { allowed, remaining, resetAt };
}
