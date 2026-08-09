/**
 * Redis Redlock implementation for distributed locking
 *
 * Prevents nonce/sequence collisions when multiple API replicas try to build
 * Stellar transactions for the same wallet concurrently.
 *
 * Spec: https://redis.io/docs/manual/patterns/dist-lock/
 *
 * Features:
 * - Single and multi-instance Redis support (quorum)
 * - Automatic retry with jitter
 * - Lua-based safe unlock and extend
 * - In-memory fallback when REDIS_URL is not configured (single-process only)
 * - Strict TypeScript, structured logging, and env-configurable defaults
 *
 * Usage:
 *   import { withWalletLock } from '@/lib/cache/redlock';
 *   await withWalletLock(walletAddress, async () => {
 *     // critical section - build transaction
 *   });
 */

import { randomUUID } from 'crypto';
import type { RedisClientType } from 'redis';
import logger from '@/lib/logger';
import { getRedisClients, hasRedisConfigured } from './redis';

// ── Config helpers ───────────────────────────────────────────────────────────

function envInt(key: string, def: number): number {
  const raw = process.env[key];
  if (!raw) return def;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? def : n;
}

// Defaults tuned for wallet signing (fast path, low contention)
export const REDLOCK_DEFAULTS = {
  ttlMs: envInt('REDIS_LOCK_TTL_MS', 10_000), // 10s - covers build+sign round-trip
  retryCount: envInt('REDIS_LOCK_RETRY_COUNT', 10),
  retryDelayMs: envInt('REDIS_LOCK_RETRY_DELAY_MS', 100),
  retryJitterMs: envInt('REDIS_LOCK_RETRY_JITTER_MS', 100),
  clockDriftFactor: 0.01, // 1% drift + 2ms min
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface RedlockOptions {
  /** Lock TTL in ms (default from REDIS_LOCK_TTL_MS) */
  ttlMs?: number;
  /** How many times to retry acquiring (default 10) */
  retryCount?: number;
  /** Base delay between retries in ms (default 100) */
  retryDelayMs?: number;
  /** Random jitter added to delay (default 100) */
  retryJitterMs?: number;
}

export interface Lock {
  /** The locked resource key */
  resource: string;
  /** Unique token that owns the lock */
  value: string;
  /** Original TTL */
  ttlMs: number;
  /** Absolute timestamp (ms) when lock becomes invalid */
  validityUntil: number;
  /** Release the lock, returns true if released, false if not owned/expired */
  release(): Promise<boolean>;
  /** Extend TTL, returns true if extended */
  extend(newTtlMs: number): Promise<boolean>;
}

export class RedlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedlockError';
  }
}

export class LockAcquisitionError extends RedlockError {
  constructor(resource: string) {
    super(`Failed to acquire lock for resource: ${resource}`);
    this.name = 'LockAcquisitionError';
  }
}

// Lua scripts for atomic check-and-delete / check-and-expire
const UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const EXTEND_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

// ── In-memory fallback (single process) ─────────────────────────────────────

interface MemoryEntry {
  locked: boolean;
  value: string | null;
  expiresAt: number | null;
  timer: NodeJS.Timeout | null;
}

const memoryLocks = new Map<string, MemoryEntry>();

function getMemoryEntry(resource: string): MemoryEntry {
  let entry = memoryLocks.get(resource);
  if (!entry) {
    entry = { locked: false, value: null, expiresAt: null, timer: null };
    memoryLocks.set(resource, entry);
  }
  return entry;
}

function clearMemoryTimer(entry: MemoryEntry): void {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

function isMemoryExpired(entry: MemoryEntry): boolean {
  return !!entry.expiresAt && Date.now() > entry.expiresAt;
}

function forceReleaseMemory(resource: string, entry: MemoryEntry): void {
  clearMemoryTimer(entry);
  entry.locked = false;
  entry.value = null;
  entry.expiresAt = null;
}

/**
 * In-memory lock acquisition with retry semantics matching Redlock spec.
 * If resource is locked and not expired, retries up to retryCount times with
 * delay + jitter. Throws LockAcquisitionError if unable to acquire.
 */
async function acquireMemoryLock(
  resource: string,
  value: string,
  ttlMs: number,
  retryCount: number,
  retryDelayMs: number,
  retryJitterMs: number
): Promise<Lock> {
  const randomDelay = (base: number, jitter: number): number =>
    base + Math.floor(Math.random() * jitter);

  for (let attempt = 0; attempt < retryCount; attempt++) {
    const entry = getMemoryEntry(resource);

    // Check expired and force release if needed
    if (entry.locked && isMemoryExpired(entry)) {
      logger.warn('[redlock] memory lock expired, forcing release', { resource });
      forceReleaseMemory(resource, entry);
    }

    if (!entry.locked) {
      // Acquire
      entry.locked = true;
      entry.value = value;
      entry.expiresAt = Date.now() + ttlMs;
      clearMemoryTimer(entry);
      entry.timer = setTimeout(() => {
        const e = memoryLocks.get(resource);
        if (e && e.value === value) {
          logger.warn('[redlock] memory lock TTL expired, auto-releasing', { resource });
          forceReleaseMemory(resource, e);
        }
      }, ttlMs);

      const validityUntil = Date.now() + ttlMs;

      const release = async (): Promise<boolean> => {
        const e = memoryLocks.get(resource);
        if (!e) return false;
        if (e.value !== value) return false;
        forceReleaseMemory(resource, e);
        return true;
      };

      const extend = async (newTtl: number): Promise<boolean> => {
        const e = memoryLocks.get(resource);
        if (!e || e.value !== value || !e.locked) return false;
        if (isMemoryExpired(e)) return false;
        clearMemoryTimer(e);
        e.expiresAt = Date.now() + newTtl;
        e.timer = setTimeout(() => {
          const en = memoryLocks.get(resource);
          if (en && en.value === value) {
            forceReleaseMemory(resource, en);
          }
        }, newTtl);
        return true;
      };

      return { resource, value, ttlMs, validityUntil, release, extend };
    }

    // Locked - retry if not last attempt
    if (attempt < retryCount - 1) {
      const delay = randomDelay(retryDelayMs, retryJitterMs);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  throw new LockAcquisitionError(resource);
}

// Test helper to reset memory locks
export function __resetMemoryLocksForTests(): void {
  for (const entry of memoryLocks.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  memoryLocks.clear();
}

// ── Redis core ───────────────────────────────────────────────────────────────

async function tryAcquireOnClient(
  client: RedisClientType,
  resource: string,
  value: string,
  ttlMs: number
): Promise<boolean> {
  try {
    // SET resource value NX PX ttl
    const result = await (client as any).set(resource, value, { NX: true, PX: ttlMs });
    return result === 'OK';
  } catch (err) {
    logger.error('[redlock] SET failed', { resource, err });
    return false;
  }
}

async function releaseOnClient(
  client: RedisClientType,
  resource: string,
  value: string
): Promise<void> {
  try {
    await (client as any).eval(UNLOCK_SCRIPT, { keys: [resource], arguments: [value] });
  } catch (err) {
    logger.error('[redlock] UNLOCK eval failed', { resource, err });
  }
}

async function extendOnClient(
  client: RedisClientType,
  resource: string,
  value: string,
  ttlMs: number
): Promise<boolean> {
  try {
    const res = await (client as any).eval(EXTEND_SCRIPT, {
      keys: [resource],
      arguments: [value, ttlMs.toString()],
    });
    return res === 1;
  } catch (err) {
    logger.error('[redlock] EXTEND eval failed', { resource, err });
    return false;
  }
}

function randomDelay(base: number, jitter: number): number {
  return base + Math.floor(Math.random() * jitter);
}

function drift(ttl: number): number {
  return ttl * REDLOCK_DEFAULTS.clockDriftFactor + 2;
}

// ── Public API: acquireLock ──────────────────────────────────────────────────

export async function acquireLock(
  resource: string,
  ttlMs: number = REDLOCK_DEFAULTS.ttlMs,
  opts: RedlockOptions = {}
): Promise<Lock> {
  const retryCount = opts.retryCount ?? REDLOCK_DEFAULTS.retryCount;
  const retryDelayMs = opts.retryDelayMs ?? REDLOCK_DEFAULTS.retryDelayMs;
  const retryJitterMs = opts.retryJitterMs ?? REDLOCK_DEFAULTS.retryJitterMs;

  const value = randomUUID();

  // Fallback if Redis not configured - use memory lock with retry semantics
  if (!hasRedisConfigured()) {
    logger.warn('[redlock] REDIS_URL not set, using in-memory fallback lock', { resource });
    return acquireMemoryLock(resource, value, ttlMs, retryCount, retryDelayMs, retryJitterMs);
  }

  let clients: RedisClientType[] = [];
  try {
    const { getRedisClients } = await import('./redis');
    clients = await getRedisClients();
  } catch (err) {
    logger.error('[redlock] Failed to get Redis clients, falling back to memory', {
      resource,
      err,
    });
    return acquireMemoryLock(resource, value, ttlMs, retryCount, retryDelayMs, retryJitterMs);
  }

  if (clients.length === 0) {
    logger.warn('[redlock] No Redis clients available, using in-memory fallback', { resource });
    return acquireMemoryLock(resource, value, ttlMs, retryCount, retryDelayMs, retryJitterMs);
  }

  const quorum = Math.floor(clients.length / 2) + 1;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    const start = Date.now();
    let successes = 0;
    const acquiredClients: RedisClientType[] = [];

    // Try to acquire on all clients in parallel
    const results = await Promise.all(
      clients.map(async (c) => {
        const ok = await tryAcquireOnClient(c, resource, value, ttlMs);
        return { client: c, ok };
      })
    );

    for (const r of results) {
      if (r.ok) {
        successes++;
        acquiredClients.push(r.client);
      }
    }

    const elapsed = Date.now() - start;
    const validity = ttlMs - elapsed - drift(ttlMs);
    const validityUntil = Date.now() + validity;

    if (successes >= quorum && validity > 0) {
      // Success - return lock that knows which clients to release
      logger.info('[redlock] Lock acquired', {
        resource,
        attempt,
        quorum: `${successes}/${clients.length}`,
        validity,
      });

      const release = async (): Promise<boolean> => {
        let released = 0;
        await Promise.all(
          acquiredClients.map(async (c) => {
            try {
              const res = await (c as any).eval(UNLOCK_SCRIPT, {
                keys: [resource],
                arguments: [value],
              });
              if (res === 1) released++;
            } catch {}
          })
        );
        const success = released >= quorum || acquiredClients.length === 0;
        logger.info('[redlock] Lock released', { resource, released, success });
        return success;
      };

      const extend = async (newTtl: number): Promise<boolean> => {
        let extended = 0;
        await Promise.all(
          acquiredClients.map(async (c) => {
            const ok = await extendOnClient(c, resource, value, newTtl);
            if (ok) extended++;
          })
        );
        return extended >= quorum;
      };

      return { resource, value, ttlMs, validityUntil, release, extend };
    }

    // Failed to acquire quorum or validity expired - release partial
    if (acquiredClients.length > 0) {
      await Promise.all(acquiredClients.map((c) => releaseOnClient(c, resource, value)));
    }

    if (attempt < retryCount - 1) {
      const delay = randomDelay(retryDelayMs, retryJitterMs);
      logger.warn('[redlock] Lock acquire failed, retrying', {
        resource,
        attempt: attempt + 1,
        retryCount,
        delay,
      });
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  logger.error('[redlock] Failed to acquire lock after retries', { resource, retryCount });
  throw new LockAcquisitionError(resource);
}

// ── Convenience: withLock ────────────────────────────────────────────────────

export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>,
  opts: RedlockOptions = {}
): Promise<T> {
  const ttlMs = opts.ttlMs ?? REDLOCK_DEFAULTS.ttlMs;
  const lock = await acquireLock(resource, ttlMs, opts);
  try {
    const result = await fn();
    return result;
  } finally {
    try {
      await lock.release();
    } catch (err) {
      logger.error('[redlock] Failed to release lock in withLock', {
        resource,
        err,
      });
    }
  }
}

// ── Wallet-specific helpers ──────────────────────────────────────────────────

export const WALLET_LOCK_PREFIX = 'lock:wallet:tx:';
export const NONCE_LOCK_PREFIX = 'lock:wallet:nonce:';

function walletLockKey(publicKey: string): string {
  return `${WALLET_LOCK_PREFIX}${publicKey}`;
}

export async function acquireWalletLock(
  walletAddress: string,
  ttlMs?: number,
  opts?: RedlockOptions
): Promise<Lock> {
  if (!walletAddress || !/^G[A-Z2-7]{55}$/.test(walletAddress)) {
    throw new Error(`Invalid Stellar public key for locking: ${walletAddress}`);
  }
  const key = walletLockKey(walletAddress);
  const effectiveTtl = ttlMs ?? REDLOCK_DEFAULTS.ttlMs;
  const mergedOpts = { ...opts, ttlMs: effectiveTtl };
  return acquireLock(key, effectiveTtl, mergedOpts);
}

export async function withWalletLock<T>(
  walletAddress: string,
  fn: () => Promise<T>,
  opts?: RedlockOptions
): Promise<T> {
  if (!walletAddress || typeof walletAddress !== 'string') {
    throw new Error('walletAddress is required for withWalletLock');
  }
  // Allow non-G addresses for internal systems (e.g. fee payer validation is relaxed
  // if the address comes from env and might be empty in tests). For strict G keys we
  // validate; otherwise we still create a deterministic lock key.
  const isStellarAddr = /^G[A-Z2-7]{55}$/.test(walletAddress);
  const resource = isStellarAddr ? walletLockKey(walletAddress) : `lock:wallet:tx:${walletAddress}`;

  return withLock(resource, fn, opts);
}

// For nonce-based auth flows
export async function withNonceLock<T>(
  walletAddress: string,
  fn: () => Promise<T>,
  opts?: RedlockOptions
): Promise<T> {
  const resource = `${NONCE_LOCK_PREFIX}${walletAddress}`;
  return withLock(resource, fn, { ttlMs: 5000, ...opts });
}

// High-level: serialize transaction signing flow
// Uses a longer TTL (30s) to cover client-side signing time if needed
export async function withWalletSigningLock<T>(
  walletAddress: string,
  fn: () => Promise<T>,
  opts?: RedlockOptions
): Promise<T> {
  const signingOpts: RedlockOptions = {
    ttlMs: envInt('REDIS_LOCK_SIGNING_TTL_MS', 30_000),
    retryCount: envInt('REDIS_LOCK_SIGNING_RETRY', 20),
    retryDelayMs: 100,
    retryJitterMs: 100,
    ...opts,
  };
  return withWalletLock(walletAddress, fn, signingOpts);
}
