import { AppError, RateLimitError } from "@/lib/errors";

/**
 * Fixed-window in-memory rate limiter.
 *
 * Adequate for a single-node deployment and for tests. A multi-instance
 * deployment must swap the store for Redis/Upstash; see docs/SECURITY.md.
 */
type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as { __btRateBuckets?: Map<string, Bucket> };
const buckets = (globalForLimiter.__btRateBuckets ??= new Map<string, Bucket>());

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const waitSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new RateLimitError(`Too many attempts. Try again in ${waitSeconds}s.`);
  }
}

export function rateLimitOrThrow(key: string, limit: number, windowMs: number, message?: string): void {
  try {
    rateLimit(key, limit, windowMs);
  } catch {
    throw new RateLimitError(message);
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** Test helper. */
export const __rateLimitInternals = { buckets };

export function assertRateLimit(condition: boolean, message = "Slow down."): void {
  if (!condition) throw new RateLimitError(message);
}

export function tooMany(message?: string): AppError {
  return new RateLimitError(message);
}
