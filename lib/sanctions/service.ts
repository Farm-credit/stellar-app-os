/**
 * Sanction list lookup service.
 *
 * Performs wallet-address screening against configurable sanction list
 * providers (Chainalysis, Elliptic, or a built-in mock for development/test).
 *
 * Architecture:
 *  1. Check local DB cache — if a fresh entry exists, return it immediately.
 *  2. Otherwise call the configured provider API.
 *  3. Persist the result to the cache table.
 *  4. Write an immutable audit log row in all cases.
 */

import type { Pool } from 'pg';
import logger from '@/lib/logger';
import type {
  SanctionCacheRow,
  SanctionCheckResult,
  SanctionLookupResult,
  RecordAuditParams,
} from '@/lib/types/sanctions';

// ── Cache TTL (default 24 hours) ──────────────────────────────────────────────

const CACHE_TTL_MS = Number(process.env.SANCTION_CACHE_TTL_MS ?? 86_400_000); // 24h

// ── Provider abstraction ──────────────────────────────────────────────────────

export interface ProviderCheckResult {
  flagged: boolean;
  provider: string;
  raw_response: Record<string, unknown>;
}

/**
 * Call the external sanction provider.
 *
 * Falls back to a deterministic mock when SANCTION_PROVIDER=mock
 * (or when no env is set in development).
 */
export async function callProvider(stellarAddress: string): Promise<ProviderCheckResult> {
  const provider = process.env.SANCTION_PROVIDER ?? 'mock';

  if (provider === 'mock') {
    // Deterministic mock: addresses starting with 'GBAD' are treated as flagged.
    const flagged = stellarAddress.startsWith('GBAD');
    return await Promise.resolve({
      flagged,
      provider: 'mock',
      raw_response: { address: stellarAddress, flagged, reason: flagged ? 'mock_hit' : null },
    });
  }

  if (provider === 'chainalysis') {
    return callChainalysis(stellarAddress);
  }

  if (provider === 'elliptic') {
    return callElliptic(stellarAddress);
  }

  throw new Error(`Unknown SANCTION_PROVIDER: ${provider}`);
}

async function callChainalysis(address: string): Promise<ProviderCheckResult> {
  const apiKey = process.env.CHAINALYSIS_API_KEY;
  if (!apiKey) throw new Error('CHAINALYSIS_API_KEY is not set');

  const url = `https://public.chainalysis.com/api/v1/address/${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Chainalysis returned ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  // Chainalysis: identifications array is non-empty when flagged
  const identifications = Array.isArray(json.identifications) ? json.identifications : [];
  return {
    flagged: identifications.length > 0,
    provider: 'chainalysis',
    raw_response: json,
  };
}

async function callElliptic(address: string): Promise<ProviderCheckResult> {
  const apiKey = process.env.ELLIPTIC_API_KEY;
  const apiSecret = process.env.ELLIPTIC_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('ELLIPTIC_API_KEY / ELLIPTIC_API_SECRET not set');

  const url = 'https://aml-api.elliptic.co/v2/wallet/synchronous';
  const body = JSON.stringify({
    subject: { asset: 'STELLAR', blockchain: 'stellar', hash: address },
    type: 'wallet_exposure',
    customer_reference: 'harvesta-sanction-check',
  });

  // Elliptic uses HMAC-SHA256 request signing — simplified here for brevity.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-key': apiKey,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Elliptic returned ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const riskScore = typeof json.risk_score === 'number' ? json.risk_score : 0;
  // Risk score >= 7 is treated as flagged (0-10 scale)
  return {
    flagged: riskScore >= 7,
    provider: 'elliptic',
    raw_response: json,
  };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

/** Read a non-expired cache entry for the given address, or null. */
export async function getCachedResult(
  pool: Pool,
  stellarAddress: string
): Promise<SanctionCacheRow | null> {
  const { rows } = await pool.query<SanctionCacheRow>(
    `SELECT * FROM sanction_cache
     WHERE stellar_address = $1
       AND cache_expires_at > NOW()
     LIMIT 1`,
    [stellarAddress]
  );
  return rows[0] ?? null;
}

/** Upsert a cache entry (insert or update on address conflict). */
export async function upsertCache(
  pool: Pool,
  stellarAddress: string,
  result: SanctionCheckResult,
  provider: string,
  rawResponse: Record<string, unknown>
): Promise<SanctionCacheRow> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  const { rows } = await pool.query<SanctionCacheRow>(
    `INSERT INTO sanction_cache
       (stellar_address, result, provider, raw_response, checked_at, cache_expires_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
     ON CONFLICT (stellar_address) DO UPDATE
       SET result           = EXCLUDED.result,
           provider         = EXCLUDED.provider,
           raw_response     = EXCLUDED.raw_response,
           checked_at       = EXCLUDED.checked_at,
           cache_expires_at = EXCLUDED.cache_expires_at,
           updated_at       = NOW()
     RETURNING *`,
    [stellarAddress, result, provider, JSON.stringify(rawResponse), expiresAt.toISOString()]
  );
  return rows[0];
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/** Append an immutable audit record (no update/delete path). */
export async function recordAudit(pool: Pool, params: RecordAuditParams): Promise<void> {
  await pool.query(
    `INSERT INTO sanction_audit_log
       (stellar_address, result, provider, cache_hit, requested_by, request_context)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.stellar_address,
      params.result,
      params.provider,
      params.cache_hit,
      params.requested_by ?? null,
      params.request_context ?? null,
    ]
  );
}

// ── Main service function ─────────────────────────────────────────────────────

/**
 * Look up a Stellar address against the sanction list.
 *
 * Steps:
 *  1. Check DB cache.
 *  2. On cache miss → call configured provider.
 *  3. Persist/refresh cache entry.
 *  4. Write audit log row (always).
 *
 * Never throws — returns result 'error' on provider failures.
 */
export async function lookupSanctionList(
  pool: Pool,
  stellarAddress: string,
  opts?: { requestedBy?: string; requestContext?: string }
): Promise<SanctionLookupResult> {
  // 1. Try cache
  const cached = await getCachedResult(pool, stellarAddress).catch((err) => {
    logger.warn('[sanctions] cache read error', { stellarAddress, err: String(err) });
    return null;
  });

  if (cached) {
    const cachedResult: SanctionCheckResult =
      cached.result === 'flagged' ? 'cached_flagged' : 'cached_clear';

    await recordAudit(pool, {
      stellar_address: stellarAddress,
      result: cachedResult,
      provider: cached.provider,
      cache_hit: true,
      requested_by: opts?.requestedBy,
      request_context: opts?.requestContext,
    }).catch((err) => logger.error('[sanctions] audit log write error', { err: String(err) }));

    logger.info('[sanctions] cache hit', { stellarAddress, result: cachedResult });

    return {
      stellar_address: stellarAddress,
      result: cachedResult,
      provider: cached.provider,
      cache_hit: true,
      checked_at: cached.checked_at.toISOString(),
      cache_expires_at: cached.cache_expires_at.toISOString(),
    };
  }

  // 2. Live provider call
  let providerResult: ProviderCheckResult;
  let finalResult: SanctionCheckResult;

  try {
    providerResult = await callProvider(stellarAddress);
    finalResult = providerResult.flagged ? 'flagged' : 'clear';
  } catch (err) {
    logger.error('[sanctions] provider error', { stellarAddress, err: String(err) });

    await recordAudit(pool, {
      stellar_address: stellarAddress,
      result: 'error',
      provider: process.env.SANCTION_PROVIDER ?? 'mock',
      cache_hit: false,
      requested_by: opts?.requestedBy,
      request_context: opts?.requestContext,
    }).catch((e) => logger.error('[sanctions] audit log write error', { err: String(e) }));

    const now = new Date().toISOString();
    return {
      stellar_address: stellarAddress,
      result: 'error',
      provider: process.env.SANCTION_PROVIDER ?? 'mock',
      cache_hit: false,
      checked_at: now,
      cache_expires_at: now,
    };
  }

  // 3. Upsert cache
  const cacheRow = await upsertCache(
    pool,
    stellarAddress,
    finalResult,
    providerResult.provider,
    providerResult.raw_response
  ).catch((err) => {
    logger.error('[sanctions] cache upsert error', { err: String(err) });
    return null;
  });

  // 4. Audit log
  await recordAudit(pool, {
    stellar_address: stellarAddress,
    result: finalResult,
    provider: providerResult.provider,
    cache_hit: false,
    requested_by: opts?.requestedBy,
    request_context: opts?.requestContext,
  }).catch((err) => logger.error('[sanctions] audit log write error', { err: String(err) }));

  logger.info('[sanctions] live check complete', { stellarAddress, result: finalResult });

  const now = new Date();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

  return {
    stellar_address: stellarAddress,
    result: finalResult,
    provider: providerResult.provider,
    cache_hit: false,
    checked_at: cacheRow?.checked_at.toISOString() ?? now.toISOString(),
    cache_expires_at: cacheRow?.cache_expires_at.toISOString() ?? expiresAt.toISOString(),
  };
}
