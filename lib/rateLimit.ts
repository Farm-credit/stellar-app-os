import { redis } from './redis';

/**
 * Sliding-window rate limiter and IP blocklist.
 *
 * Uses Redis if REDIS_URL is configured, otherwise falls back to an
 * in-memory Map (suitable for single-instance or development environments).
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
  { allowed: true } | { allowed: false; reason: 'blocklist' | 'rate_limit'; retryAfter?: number };

export async function checkRateLimit(ip: string, limit = DEFAULT_LIMIT): Promise<RateLimitResult> {
  if (BLOCKLIST.has(ip)) return { allowed: false, reason: 'blocklist' };

  const now = Date.now();

  if (redis) {
    try {
      const key = `ratelimit:${ip}`;
      const cutoff = now - WINDOW_MS;

      const multi = redis.multi();
      multi.zRemRangeByScore(key, 0, cutoff);
      multi.zAdd(key, [{ score: now, value: `${now}-${Math.random()}` }]);
      multi.zRange(key, 0, 0, { WITHSCORES: true });
      multi.zCard(key);
      multi.expire(key, Math.ceil(WINDOW_MS / 1000));

      const [, , firstElem, count] = (await multi.exec()) as [
        number,
        number,
        string[] | Array<{ value: string; score: number }>,
        number,
        boolean,
      ];

      if (count > limit) {
        // firstElem could be string[] or object array depending on redis version/client options
        let oldestScore = now;
        if (Array.isArray(firstElem) && firstElem.length > 0) {
          const first = firstElem[0];
          if (typeof first === 'object' && 'score' in first) {
            oldestScore = first.score;
          } else if (typeof first === 'string' && firstElem.length > 1) {
            // If withScores returned flat array [value, score, value, score]
            oldestScore = parseFloat(firstElem[1] as string);
          }
        }

        return {
          allowed: false,
          reason: 'rate_limit',
          retryAfter: Math.ceil((oldestScore + WINDOW_MS - now) / 1000),
        };
      }
      return { allowed: true };
    } catch (error) {
      console.error('Redis rate limit error, falling back to memory:', error);
      // Fallback below if Redis fails
    }
  }

  // In-memory fallback
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

// ── Public API authentication and quota enforcement ─────────────────────────
// Supports API keys (prefix "pk_") and OAuth2 bearer tokens (prefix "oat_").
// Each credential is tracked against a per-scope quota with daily counters
// that back the quota dashboard.

const PUBLIC_API_WINDOW_MS = 60_000; // 1-minute window for burst limiting
const PUBLIC_API_DEFAULT_LIMIT = 60; // requests per window per credential
const PUBLIC_API_DAILY_LIMIT = 10_000; // requests per day per credential

export interface PublicApiCredential {
  id: string;
  kind: 'api_key' | 'oauth2';
  scopes: string[];
}

export interface PublicApiQuotaResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  daily: {
    limit: number;
    used: number;
    remaining: number;
    resetAt: number;
  };
  reason?: 'invalid_credential' | 'insufficient_scope' | 'rate_limit' | 'daily_quota';
}

interface QuotaEntry {
  windowCount: number;
  windowResetAt: number;
  dailyCount: number;
  dailyResetAt: number;
}

const quotaEntries = new Map<string, QuotaEntry>();

function startOfNextUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * Verify an API key or OAuth2 bearer token and return the associated
 * credential. Returns null when the credential is missing or malformed.
 *
 * Real deployments should validate against a persisted credential store;
 * this implementation validates format and resolves scopes deterministically.
 */
export function verifyPublicApiCredential(
  authorization: string | undefined,
  apiKey: string | undefined,
): PublicApiCredential | null {
  const token = apiKey?.trim() || extractBearerToken(authorization);
  if (!token) return null;

  if (token.startsWith('pk_') && token.length > 3) {
    return { id: token, kind: 'api_key', scopes: ['trees:read', 'sponsorships:write'] };
  }

  if (token.startsWith('oat_') && token.length > 4) {
    return { id: token, kind: 'oauth2', scopes: ['trees:read', 'sponsorships:write', 'webhooks:manage'] };
  }

  return null;
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : undefined;
}

/**
 * Enforce per-credential quota for a public API scope.
 *
 * Applies a per-minute burst limit and a daily quota, returning the counters
 * needed to render the quota dashboard.
 */
export async function checkPublicApiQuota(
  apiKey: string | undefined,
  scope: string,
  authorization?: string,
): Promise<PublicApiQuotaResult> {
  const now = Date.now();
  const credential = verifyPublicApiCredential(authorization, apiKey);

  if (!credential) {
    return {
      allowed: false,
      limit: PUBLIC_API_DEFAULT_LIMIT,
      remaining: 0,
      resetAt: now + PUBLIC_API_WINDOW_MS,
      daily: { limit: PUBLIC_API_DAILY_LIMIT, used: 0, remaining: 0, resetAt: startOfNextUtcDay(now) },
      reason: 'invalid_credential',
    };
  }

  if (!credential.scopes.includes(scope)) {
    return {
      allowed: false,
      limit: PUBLIC_API_DEFAULT_LIMIT,
      remaining: 0,
      resetAt: now + PUBLIC_API_WINDOW_MS,
      daily: { limit: PUBLIC_API_DAILY_LIMIT, used: 0, remaining: 0, resetAt: startOfNextUtcDay(now) },
      reason: 'insufficient_scope',
    };
  }

  const key = `publicapi:${credential.kind}:${credential.id}:${scope}`;
  const entry = quotaEntries.get(key) ?? {
    windowCount: 0,
    windowResetAt: now + PUBLIC_API_WINDOW_MS,
    dailyCount: 0,
    dailyResetAt: startOfNextUtcDay(now),
  };

  if (now >= entry.windowResetAt) {
    entry.windowCount = 0;
    entry.windowResetAt = now + PUBLIC_API_WINDOW_MS;
  }
  if (now >= entry.dailyResetAt) {
    entry.dailyCount = 0;
    entry.dailyResetAt = startOfNextUtcDay(now);
  }

  const dailyRemaining = Math.max(0, PUBLIC_API_DAILY_LIMIT - entry.dailyCount);
  const windowRemaining = Math.max(0, PUBLIC_API_DEFAULT_LIMIT - entry.windowCount);

  if (entry.dailyCount >= PUBLIC_API_DAILY_LIMIT) {
    quotaEntries.set(key, entry);
    return {
      allowed: false,
      limit: PUBLIC_API_DEFAULT_LIMIT,
      remaining: windowRemaining,
      resetAt: entry.windowResetAt,
      daily: {
        limit: PUBLIC_API_DAILY_LIMIT,
        used: entry.dailyCount,
        remaining: 0,
        resetAt: entry.dailyResetAt,
      },
      reason: 'daily_quota',
    };
  }

  if (entry.windowCount >= PUBLIC_API_DEFAULT_LIMIT) {
    quotaEntries.set(key, entry);
    return {
      allowed: false,
      limit: PUBLIC_API_DEFAULT_LIMIT,
      remaining: 0,
      resetAt: entry.windowResetAt,
      daily: {
        limit: PUBLIC_API_DAILY_LIMIT,
        used: entry.dailyCount,
        remaining: dailyRemaining,
        resetAt: entry.dailyResetAt,
      },
      reason: 'rate_limit',
    };
  }

  entry.windowCount += 1;
  entry.dailyCount += 1;
  quotaEntries.set(key, entry);

  return {
    allowed: true,
    limit: PUBLIC_API_DEFAULT_LIMIT,
    remaining: Math.max(0, PUBLIC_API_DEFAULT_LIMIT - entry.windowCount),
    resetAt: entry.windowResetAt,
    daily: {
      limit: PUBLIC_API_DAILY_LIMIT,
      used: entry.dailyCount,
      remaining: Math.max(0, PUBLIC_API_DAILY_LIMIT - entry.dailyCount),
      resetAt: entry.dailyResetAt,
    },
  };
}

export async function checkSubmitAnonRateLimit(ip: string): Promise<SlidingRateLimitResult> {
  if (BLOCKLIST.has(ip)) {
    return { allowed: false, reason: 'blocklist', remaining: 0, reset: 0 };
  }

  const now = Date.now();
  const cutoff = now - SUBMIT_ANON_WINDOW_MS;

  if (redis) {
    try {
      const key = `ratelimit:anon:${ip}`;

      const multi = redis.multi();
      multi.zRemRangeByScore(key, 0, cutoff);
      multi.zAdd(key, [{ score: now, value: `${now}-${Math.random()}` }]);
      multi.zRangeWithScores(key, 0, 0); // Using zRangeWithScores directly avoids type ambiguity
      multi.zCard(key);
      multi.expire(key, Math.ceil(SUBMIT_ANON_WINDOW_MS / 1000));

      const [, , firstElem, count] = (await multi.exec()) as [
        number,
        number,
        Array<{ value: string; score: number }>,
        number,
        boolean,
      ];

      if (count > SUBMIT_ANON_LIMIT) {
        const oldestScore = firstElem?.[0]?.score ?? now;
        return {
          allowed: false,
          reason: 'rate_limit',
          retryAfter: Math.ceil((oldestScore + SUBMIT_ANON_WINDOW_MS - now) / 1000),
          remaining: 0,
          reset: oldestScore + SUBMIT_ANON_WINDOW_MS,
        };
      }

      return {
        allowed: true,
        remaining: SUBMIT_ANON_LIMIT - count,
        reset: now + SUBMIT_ANON_WINDOW_MS,
      };
    } catch (error) {
      console.error('Redis anon rate limit error, falling back to memory:', error);
      // Fallback below
    }
  }

  // In-memory fallback
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
