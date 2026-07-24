/**
 * In-memory sliding-window rate limiter and IP blocklist.
 *
 * Production note: for multi-replica deployments, replace the Map with a
 * Redis-backed store (e.g. @upstash/ratelimit) to share state across workers.
 */

const WINDOW_MS = 60_000; // 1-minute window
const DEFAULT_LIMIT = 100; // max requests per window per IP

// Seed the blocklist from an env var so ops can block IPs without a deploy.
const ENV_BLOCKED = (process.env.BLOCKED_IPS ?? '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const BLOCKLIST = new Set<string>(ENV_BLOCKED);

interface WindowEntry {
  count: number;
  resetAt: number;
}

// Module-scoped — persists for the lifetime of the worker process.
const windows = new Map<string, WindowEntry>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'blocklist' | 'rate_limit'; retryAfter?: number };

export function checkRateLimit(ip: string, limit = DEFAULT_LIMIT): RateLimitResult {
  if (BLOCKLIST.has(ip)) return { allowed: false, reason: 'blocklist' };

  const now = Date.now();
  const entry = windows.get(ip);

  if (!entry || now >= entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  entry.count += 1;

  if (entry.count > limit) {
    return {
      allowed: false,
      reason: 'rate_limit',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { allowed: true };
}

/** Programmatically block an IP at runtime (e.g. after detecting abuse). */
export function blockIp(ip: string): void {
  BLOCKLIST.add(ip);
}

// ── Sliding-window rate limiter for anonymous transaction submission ────────
// Each IP may submit at most 5 anonymous transactions per rolling 1-hour window.

const SUBMIT_ANON_WINDOW_MS = 3_600_000; // 1 hour
const SUBMIT_ANON_LIMIT = 5;

interface SlidingEntry {
  timestamps: number[];
}

const submitAnonWindows = new Map<string, SlidingEntry>();

export type SlidingRateLimitResult =
  | { allowed: true; remaining: number; reset: number }
  | {
      allowed: false;
      reason: 'blocklist' | 'rate_limit';
      retryAfter?: number;
      remaining: number;
      reset: number;
    };

export function checkSubmitAnonRateLimit(ip: string): SlidingRateLimitResult {
  if (BLOCKLIST.has(ip)) {
    return { allowed: false, reason: 'blocklist', remaining: 0, reset: 0 };
  }

  const now = Date.now();
  const cutoff = now - SUBMIT_ANON_WINDOW_MS;
  const entry = submitAnonWindows.get(ip);

  if (!entry) {
    submitAnonWindows.set(ip, { timestamps: [now] });
    return { allowed: true, remaining: SUBMIT_ANON_LIMIT - 1, reset: now + SUBMIT_ANON_WINDOW_MS };
  }

  // Prune timestamps that have fallen outside the sliding window.
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  if (entry.timestamps.length >= SUBMIT_ANON_LIMIT) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + SUBMIT_ANON_WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      reason: 'rate_limit',
      retryAfter,
      remaining: 0,
      reset: oldest + SUBMIT_ANON_WINDOW_MS,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: SUBMIT_ANON_LIMIT - entry.timestamps.length,
    reset: now + SUBMIT_ANON_WINDOW_MS,
  };
}
