/**
 * Single-use nonce store for wallet-signature authentication.
 *
 * Uses Redis when REDIS_URL is configured for distributed consistency
 * across multiple API replicas, with in-memory fallback for local dev.
 *
 * Redis key pattern: auth:nonce:{walletAddress} -> nonce value with TTL 5m
 * Atomic consume via Lua: GET + DEL only if matches.
 */

import { randomUUID } from 'crypto';
import { getRedisClient, hasRedisConfigured } from '@/lib/cache/redis';
import { withNonceLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

const TTL_MS = 5 * 60 * 1000; // 5-minute TTL
const TTL_SECONDS = 300;
const NONCE_PREFIX = 'auth:nonce:';

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

// In-memory fallback store — persists for lifetime of worker
const memoryStore = new Map<string, NonceEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now > entry.expiresAt) memoryStore.delete(key);
  }
}

function nonceKey(walletAddress: string): string {
  return `${NONCE_PREFIX}${walletAddress}`;
}

// Lua script for atomic consume: if GET == nonce then DEL else 0
const CONSUME_SCRIPT = `
  local current = redis.call("GET", KEYS[1])
  if current == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

function isStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr);
}

/**
 * Generate a single-use nonce for wallet address.
 * Stores in Redis if available, otherwise in-memory.
 */
export async function generateNonce(walletAddress: string): Promise<string> {
  if (!isStellarAddress(walletAddress)) {
    throw new Error('Invalid Stellar wallet address for nonce generation');
  }

  const nonce = randomUUID();

  // Try Redis first
  if (hasRedisConfigured()) {
    try {
      const client = (await getRedisClient()) as any;
      if (client) {
        const key = nonceKey(walletAddress);
        // Use withNonceLock to prevent race on same wallet
        await withNonceLock(walletAddress, async () => {
          await client.set(key, nonce, { EX: TTL_SECONDS });
        });
        logger.info('[auth:nonce] Generated nonce (redis)', { walletAddress });
        return nonce;
      }
    } catch (err) {
      logger.error('[auth:nonce] Redis set failed, falling back to memory', {
        walletAddress,
        err,
      });
    }
  }

  // Fallback to memory
  evictExpired();
  memoryStore.set(walletAddress, { nonce, expiresAt: Date.now() + TTL_MS });
  logger.info('[auth:nonce] Generated nonce (memory)', { walletAddress });
  return nonce;
}

/**
 * Validates and consumes the nonce (single-use).
 * Returns true if valid and consumed, false otherwise.
 * Async - uses Redis atomic Lua when available.
 */
export async function consumeNonce(walletAddress: string, nonce: string): Promise<boolean> {
  if (!walletAddress || !nonce) return false;

  if (hasRedisConfigured()) {
    try {
      const client = (await getRedisClient()) as any;
      if (client) {
        const key = nonceKey(walletAddress);
        const result = await client.eval(CONSUME_SCRIPT, {
          keys: [key],
          arguments: [nonce],
        });
        const consumed = result === 1;
        if (consumed) {
          logger.info('[auth:nonce] Consumed nonce (redis)', { walletAddress });
        } else {
          logger.warn('[auth:nonce] Invalid/expired nonce (redis)', { walletAddress });
        }
        return consumed;
      }
    } catch (err) {
      logger.error('[auth:nonce] Redis consume failed, falling back to memory', {
        walletAddress,
        err,
      });
    }
  }

  // Memory fallback path - must be synchronized via lock-like logic
  // Use simple check but with eviction
  const entry = memoryStore.get(walletAddress);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(walletAddress);
    return false;
  }
  if (entry.nonce !== nonce) return false;
  memoryStore.delete(walletAddress);
  logger.info('[auth:nonce] Consumed nonce (memory)', { walletAddress });
  return true;
}

// ── Synchronous wrappers for backward compatibility (uses memory store only) ──
// These are deprecated and will be removed. Prefer async versions above.

export function generateNonceSync(walletAddress: string): string {
  evictExpired();
  const nonce = randomUUID();
  memoryStore.set(walletAddress, { nonce, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

export function consumeNonceSync(walletAddress: string, nonce: string): boolean {
  const entry = memoryStore.get(walletAddress);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(walletAddress);
    return false;
  }
  if (entry.nonce !== nonce) return false;
  memoryStore.delete(walletAddress);
  return true;
}

// Legacy exports that work both sync and async depending on env:
// For code that hasn't migrated yet, we export functions that if Redis is not
// configured behave synchronously (by returning string directly) and if Redis is
// configured they still work but will use async path under the hood via memory.
// To avoid breaking, we keep original sync signatures as aliases that call sync versions
// when hasRedisConfigured() is false, but for safety we re-export async as primary
// and add sync aliases.

export const __memoryStoreForTests = memoryStore;

export function __resetForTests(): void {
  memoryStore.clear();
}
