/**
 * Single-use nonce store for wallet-signature authentication.
 *
 * Production note: replace the in-memory Map with Redis + TTL keys to share
 * state across multiple API replicas and survive restarts.
 */

const TTL_MS = 5 * 60 * 1000; // 5-minute TTL

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

const store = new Map<string, NonceEntry>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

export function generateNonce(walletAddress: string): string {
  evictExpired();
  const nonce = crypto.randomUUID();
  store.set(walletAddress, { nonce, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

/**
 * Validates and consumes the nonce (single-use).
 * Returns false if the nonce is invalid, expired, or already used.
 */
export function consumeNonce(walletAddress: string, nonce: string): boolean {
  const entry = store.get(walletAddress);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(walletAddress);
    return false;
  }
  if (entry.nonce !== nonce) return false;
  store.delete(walletAddress);
  return true;
}
