/**
 * API-key authentication for the third-party farmer verification API
 * (Farm-credit/stellar-app-os#1403).
 *
 * `proxy.ts` validates `x-api-key` and applies the tiered rate limit, but a
 * request that presents *no* key is not rejected there — it falls through to
 * the shared per-IP limiter. The verification routes therefore assert a key
 * themselves before disclosing farmer data, and reuse the resolved key to
 * report the caller's tier back in `X-API-Tier`.
 *
 * The key lookup is injectable so the route handlers stay thin and the
 * authentication rule can be tested without a database.
 */

import type { ApiKeyRow, ApiKeyTier } from '@/lib/db/schema';
import { findApiKeyByRawValue } from '@/lib/api/apiKeys';

export interface VerificationClient {
  id: number;
  name: string;
  prefix: string;
  tier: ApiKeyTier;
}

export type VerificationAuthResult =
  | { ok: true; client: VerificationClient }
  | { ok: false; status: 401; error: string };

export type ApiKeyLookup = (rawKey: string) => Promise<ApiKeyRow | null>;

/**
 * Resolve the `x-api-key` header to an active key.
 *
 * A missing header and an unknown/revoked key both return `401`: the caller
 * must not be able to tell whether a key ever existed.
 */
export async function authenticateFarmerVerificationRequest(
  request: Request,
  lookup: ApiKeyLookup = findApiKeyByRawValue
): Promise<VerificationAuthResult> {
  const rawKey = request.headers.get('x-api-key')?.trim();
  if (!rawKey) {
    return {
      ok: false,
      status: 401,
      error: 'Missing x-api-key header. Request a key via POST /api/api-keys.',
    };
  }

  const key = await lookup(rawKey);
  if (!key) {
    return { ok: false, status: 401, error: 'Invalid, revoked, or inactive API key.' };
  }

  return {
    ok: true,
    client: { id: key.id, name: key.name, prefix: key.prefix, tier: key.tier },
  };
}
