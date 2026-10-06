import { redis } from '@/lib/redis';
import type { ApiKeyTier } from '@/lib/db/schema';
import { hourlyBudget } from '@/lib/api/apiKeyTiers';
import { hashKey } from '@/lib/api/apiKeys';

/**
 * Tiered, per-API-key rate limiting with request queuing.
 *
 * Limits follow the tier table:
 *   - free     100 requests / rolling 1-hour window
 *   - standard 1000 requests / rolling 1-hour window
 *   - premium  unlimited (a generous floor is enforced to keep the shuffling
 *              slots sane, but the effective hourly budget is unbounded)
 *
 * When a key exhausts its hourly budget its requests are queued (Redis list)
 * instead of being dropped or rejected outright. The queue drains as the
 * window rolls and capacity frees up. Premium keys are effectively never
 * queued because their budget is unbounded.
 */

export const WINDOW_MS = 3_600_000; // 1 rolling hour
const QUEUE_TTL_SECONDS = 2 * 3600; // 2 hours
const PREMIUM_SOFT_FLOOR = 10_000; // safety floor for the unbounded tier

interface TieredLimitResult {
  allowed: boolean;
  limited: boolean;
  queued: boolean;
  tier: ApiKeyTier;
  limit: number | null;
  remaining: number | null;
  retryAfter?: number;
}

// ── In-memory fallback (used when Redis is unavailable) ───────────────────────
interface MemoryWindow {
  timestamps: number[];
  queued: number;
}

const memoryWindows = new Map<string, MemoryWindow>();

function memoryWindow(keyHash: string): MemoryWindow {
  let entry = memoryWindows.get(keyHash);
  if (!entry) {
    entry = { timestamps: [], queued: 0 };
    memoryWindows.set(keyHash, entry);
  }
  return entry;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

function streamKey(keyHash: string): string {
  return `ratelimit:tier:${keyHash}:stream`;
}

function queueKey(keyHash: string): string {
  return `ratelimit:tier:${keyHash}:queue`;
}

/**
 * Enforces the tiered limit for a single API key.
 *
 * @param rawKey     The raw `fc_...` value presented by the client.
 * @param tier       The tier assigned to the key.
 */
export async function checkTieredRateLimit(
  rawKey: string,
  tier: ApiKeyTier
): Promise<TieredLimitResult> {
  const keyHash = hashKey(rawKey);
  const budget = hourlyBudget(tier);
  const effectiveLimit = budget === null ? PREMIUM_SOFT_FLOOR : budget;
  const now = Date.now();

  if (redis) {
    try {
      return await checkWithRedis(keyHash, tier, effectiveLimit);
    } catch (error) {
      console.error('[tiered] Redis rate limit error, falling back to memory:', error);
    }
  }

  // ── In-memory fallback ───────────────────────────────────────────────────
  const entry = memoryWindow(keyHash);
  const cutoff = now - WINDOW_MS;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  if (budget === null) {
    // Premium: unbounded — always allow.
    entry.timestamps.push(now);
    if (entry.timestamps.length > PREMIUM_SOFT_FLOOR) {
      // Drift protection: trim to MIN ourselves so memory doesn't balloon.
      entry.timestamps = entry.timestamps.slice(-PREMIUM_SOFT_FLOOR);
    }
    return { allowed: true, limited: false, queued: false, tier, limit: null, remaining: null };
  }

  if (entry.timestamps.length < effectiveLimit) {
    entry.timestamps.push(now);
    return {
      allowed: true,
      limited: false,
      queued: false,
      tier,
      limit: effectiveLimit,
      remaining: effectiveLimit - entry.timestamps.length,
    };
  }

  // Budget exhausted → queue the request.
  entry.queued += 1;
  return {
    allowed: false,
    limited: true,
    queued: true,
    tier,
    limit: effectiveLimit,
    remaining: 0,
    retryAfter: Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000),
  };
}

async function checkWithRedis(
  keyHash: string,
  tier: ApiKeyTier,
  effectiveLimit: number
): Promise<TieredLimitResult> {
  const budget = hourlyBudget(tier);
  const now = Date.now();
  const stream = streamKey(keyHash);
  const cutoff = now - WINDOW_MS;

  if (budget === null) {
    // Premium tier — unbounded. We still append for soft-floor accounting but
    // never reject. Prune old entries to keep the set bounded.
    const multi = redis.multi();
    multi.zRemRangeByScore(stream, 0, cutoff);
    multi.zAdd(stream, [{ score: now, value: `${now}-${Math.random()}` }]);
    multi.expire(stream, Math.ceil(WINDOW_MS / 1000));
    await multi.exec();
    return { allowed: true, limited: false, queued: false, tier, limit: null, remaining: null };
  }

  const multi = redis.multi();
  multi.zRemRangeByScore(stream, 0, cutoff);
  multi.zAdd(stream, [{ score: now, value: `${now}-${Math.random()}` }]);
  multi.zRangeWithScores(stream, 0, 0);
  multi.zCard(stream);
  multi.expire(stream, Math.ceil(WINDOW_MS / 1000));

  const [, , firstElem, count] = (await multi.exec()) as [
    unknown,
    unknown,
    Array<{ value: string; score: number }>,
    number,
  ];

  if (count <= effectiveLimit) {
    return {
      allowed: true,
      limited: false,
      queued: false,
      tier,
      limit: effectiveLimit,
      remaining: effectiveLimit - count,
    };
  }

  // Budget exhausted → queue the request.
  const qkey = queueKey(keyHash);
  await redis.rPush(qkey, JSON.stringify({ enqueuedAt: now }));
  await redis.expire(qkey, QUEUE_TTL_SECONDS);

  const oldestScore = firstElem?.[0]?.score ?? now;
  return {
    allowed: false,
    limited: true,
    queued: true,
    tier,
    limit: effectiveLimit,
    remaining: 0,
    retryAfter: Math.ceil(Math.max(0, oldestScore + WINDOW_MS - now) / 1000),
  };
}

/**
 * Returns the number of requests currently waiting in a key's queue.
 * Useful for observability endpoints and back-off heuristics.
 */
export async function queuedRequestCount(rawKey: string): Promise<number> {
  const keyHash = hashKey(rawKey);
  if (redis) {
    try {
      const len = await redis.lLen(queueKey(keyHash));
      return len;
    } catch (error) {
      console.error('[tiered] queuedRequestCount redis error:', error);
    }
  }
  const entry = memoryWindows.get(keyHash);
  return entry ? entry.queued : 0;
}

/**
 * Drains the queue for a key — returns and removes one queued request, or
 * null when the queue is empty.
 */
export async function dequeueRequest(rawKey: string): Promise<number | null> {
  const keyHash = hashKey(rawKey);
  if (redis) {
    try {
      const value = await redis.lPop(queueKey(keyHash));
      return value ? Date.now() : null;
    } catch (error) {
      console.error('[tiered] dequeueRequest redis error:', error);
      return null;
    }
  }
  const entry = memoryWindows.get(keyHash);
  if (entry && entry.queued > 0) {
    entry.queued -= 1;
    return Date.now();
  }
  return null;
}
