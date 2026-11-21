import { createHash, randomBytes } from 'crypto';
import { getPool } from '@/lib/db/client';
import type { ApiKeyRow, ApiKeyTier } from '@/lib/db/schema';
import { isApiKeyTier } from '@/lib/api/apiKeyTiers';

/**
 * API key lifecycle helpers.
 *
 * Keys are stored hashed (SHA-256 of the full `fc_...` value) — the raw key
 * is shown exactly once at creation time and cannot be recovered later. A
 * short prefix is stored in plaintext for operator identification.
 */

const KEY_PREFIX = 'fc_';
const KEY_BYTES = 32;

export interface GeneratedApiKey {
  /** Full key, shown once. Client must store this. */
  key: string;
  /** Stable identifier stored in the DB. */
  keyHash: string;
  /** Short prefix used for display/logging. */
  prefix: string;
  id: number;
}

function hashKey(fullKey: string): string {
  return createHash('sha256').update(fullKey, 'utf8').digest('hex');
}

function makePrefix(): string {
  return `${KEY_PREFIX}${randomBytes(4).toString('hex')}`;
}

/**
 * Creates a new active API key. The raw key is returned exactly once — callers
 * are responsible for surfacing it to the owner before discarding it.
 */
export async function createApiKey(options: {
  name: string;
  tier: ApiKeyTier;
  ownerWallet?: string | null;
}): Promise<GeneratedApiKey> {
  if (!isApiKeyTier(options.tier)) {
    throw new Error(`Invalid API key tier: ${String(options.tier)}`);
  }

  const key = `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64url')}`;
  const keyHash = hashKey(key);
  const prefix = makePrefix();

  const result = await getPool().query<ApiKeyRow>(
    `INSERT INTO api_keys (name, prefix, key_hash, tier, owner_wallet)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, prefix, key_hash, tier, owner_wallet, is_active, created_at, last_used_at, revoked_at`,
    [options.name, prefix, keyHash, options.tier, options.ownerWallet ?? null]
  );

  return { key, keyHash, prefix, id: result.rows[0].id };
}

/**
 * Looks up an active (non-revoked) API key by its raw value.
 * Returns null when the key is unknown, revoked, or inactive.
 */
export async function findApiKeyByRawValue(rawKey: string): Promise<ApiKeyRow | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashKey(rawKey);
  const result = await getPool().query<ApiKeyRow>(
    `SELECT id, name, prefix, key_hash, tier, owner_wallet, is_active, created_at, last_used_at, revoked_at
     FROM api_keys
     WHERE key_hash = $1 AND is_active = TRUE AND revoked_at IS NULL
     LIMIT 1`,
    [keyHash]
  );
  return result.rows[0] ?? null;
}

/** Lists all keys owned by a wallet (or all keys when ownerWallet is null). */
export async function listApiKeys(ownerWallet?: string | null): Promise<ApiKeyRow[]> {
  const pool = getPool();
  const result = ownerWallet
    ? await pool.query<ApiKeyRow>(
        `SELECT id, name, prefix, key_hash, tier, owner_wallet, is_active, created_at, last_used_at, revoked_at
         FROM api_keys
         WHERE owner_wallet = $1
         ORDER BY created_at DESC`,
        [ownerWallet]
      )
    : await pool.query<ApiKeyRow>(
        `SELECT id, name, prefix, key_hash, tier, owner_wallet, is_active, created_at, last_used_at, revoked_at
         FROM api_keys
         ORDER BY created_at DESC`
      );
  return result.rows;
}

/** Marks a key as revoked. Returns true when an active key was revoked. */
export async function revokeApiKey(id: number): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE api_keys
     SET is_active = FALSE, revoked_at = NOW()
     WHERE id = $1 AND is_active = TRUE AND revoked_at IS NULL`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Records that a key was used at this instant. */
export async function touchApiKey(id: number): Promise<void> {
  try {
    await getPool().query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [id]);
  } catch (error) {
    // Best-effort only — a failed touch must not fail the request.
    console.error('[api-keys] touch failed', { id, error });
  }
}

/**
 * Accumulates rolling-hour usage for an API key. The row is keyed by
 * (api_key_id, window_ms) so different hour buckets stay independent.
 */
export async function recordApiKeyUsage(
  id: number,
  windowMs: number,
  requestCount: number,
  queuedCount: number
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO api_key_usage (api_key_id, window_ms, count, queued, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (api_key_id, window_ms)
       DO UPDATE SET
         count = api_key_usage.count + EXCLUDED.count,
         queued = api_key_usage.queued + EXCLUDED.queued,
         updated_at = NOW()`,
      [id, windowMs, requestCount, queuedCount]
    );
  } catch (error) {
    // Best-effort only — usage accounting must not fail the request.
    console.error('[api-keys] usage record failed', { id, error });
  }
}

export { hashKey };
