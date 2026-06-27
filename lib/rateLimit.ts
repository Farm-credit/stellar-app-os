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
