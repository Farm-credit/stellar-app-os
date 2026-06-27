/**
 * Simple in-process cache with a 30-second TTL.
 * Used by the tree registry REST endpoints to avoid hammering Horizon / the
 * contract RPC on every request.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const TTL_MS = 30_000; // 30 seconds

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Exposed for tests so they can wipe state between runs. */
export function cacheClear(): void {
  store.clear();
}
