import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

// Create a singleton Redis client instance
export const redis = redisUrl ? createClient({ url: redisUrl }) : null;

if (redis) {
  redis.on('error', (err) => console.error('Redis Client Error:', err));

  // Connect eagerly if URL is provided
  redis.connect().catch(console.error);
}

export type RedisClientType = typeof redis;

/**
 * Default TTL (in seconds) for a digest lock.
 * A digest is sent once per local day, so a 25-hour TTL comfortably covers
 * the window between scheduler runs while still expiring stale locks.
 */
const DIGEST_LOCK_TTL_SECONDS = 25 * 60 * 60;

/**
 * Build the Redis key used to guard a single digest send for a sponsor on a
 * given local day, e.g. `digest:lock:<sponsorId>:<yyyy-mm-dd>`.
 */
export function buildDigestLockKey(sponsorId: string, localDate: string): string {
  return `digest:lock:${sponsorId}:${localDate}`;
}

/**
 * In-memory fallback guard used when Redis is not configured (no REDIS_URL).
 * This keeps the worker idempotent within a single process. For multi-instance
 * deployments without Redis, callers should additionally rely on a DB-based
 * guard (e.g. a unique constraint on (sponsorId, localDate) in a digest log).
 */
const inMemoryDigestLocks = new Map<string, number>();

function pruneInMemoryLocks(now: number): void {
  for (const [key, expiresAt] of inMemoryDigestLocks) {
    if (expiresAt <= now) {
      inMemoryDigestLocks.delete(key);
    }
  }
}

/**
 * Attempt to acquire a per-sponsor-per-day digest lock.
 *
 * Returns `true` if the lock was acquired (i.e. this caller is responsible for
 * sending the digest), or `false` if a lock already exists (another scheduler
 * run already claimed this sponsor for the day).
 *
 * When Redis is unavailable, falls back to an in-memory guard. Callers in
 * multi-instance environments should pair this with a DB-based uniqueness
 * guard to guarantee at-most-once delivery.
 */
export async function acquireDigestLock(
  sponsorId: string,
  localDate: string,
  ttlSeconds: number = DIGEST_LOCK_TTL_SECONDS,
): Promise<boolean> {
  const key = buildDigestLockKey(sponsorId, localDate);

  if (redis) {
    try {
      const result = await redis.set(key, '1', {
        NX: true,
        EX: ttlSeconds,
      });
      return result === 'OK';
    } catch (err) {
      console.error('Failed to acquire digest lock in Redis:', err);
      // Fall through to the in-memory guard so a transient Redis error does
      // not cause duplicate digests within this process.
    }
  }

  const now = Date.now();
  pruneInMemoryLocks(now);

  const existing = inMemoryDigestLocks.get(key);
  if (existing !== undefined && existing > now) {
    return false;
  }

  inMemoryDigestLocks.set(key, now + ttlSeconds * 1000);
  return true;
}

/**
 * Release a previously acquired digest lock.
 *
 * Typically not needed (the TTL expires the lock), but useful when a digest
 * send fails and the worker wants to allow a retry within the same day.
 */
export async function releaseDigestLock(
  sponsorId: string,
  localDate: string,
): Promise<void> {
  const key = buildDigestLockKey(sponsorId, localDate);

  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.error('Failed to release digest lock in Redis:', err);
    }
  }

  inMemoryDigestLocks.delete(key);
}