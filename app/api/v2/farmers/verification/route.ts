/**
 * POST /api/v2/farmers/verification — Farm-credit/stellar-app-os#1403
 *
 * Batch counterpart to `GET /api/v2/farmers/{address}/verification`, built for
 * the way lenders actually use a verification API: a single call over a
 * portfolio of farmers instead of N round trips.
 *
 *   { "addresses": ["G…", "G…"] }   // 1–100 unique Stellar public keys
 *
 * Response:
 *   {
 *     requested, count, verified,
 *     reports: FarmerVerificationReport[],
 *     notFound: string[],
 *     consentDenied: string[]
 *   }
 *
 * `notFound` and `consentDenied` are reported separately so a caller can tell
 * "not a registered farmer" apart from "farmer opted out of disclosure". The
 * request is rejected as a whole when any entry is malformed, so a partial
 * tranche can never be mistaken for a complete one.
 *
 * Authentication mirrors the single-farmer route: an `x-api-key` header with a
 * key issued via `POST /api/api-keys`; `proxy.ts` applies the tiered rate
 * limit. See `docs/PUBLIC_API.md`.
 *
 * Responses
 * ---------
 *   200  FarmerVerificationBatch
 *   400  { error, details: string[] }
 *   401  { error }
 *   500  { error }
 *   503  { error }                                   — auth lookup unavailable
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { authenticateFarmerVerificationRequest } from '@/lib/api/farmer-verification-auth';
import {
  MAX_BATCH_ADDRESSES,
  parseVerificationAddresses,
  verifyFarmers,
} from '@/lib/api/farmer-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function responseHeaders(tier?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
  if (tier) headers['X-API-Tier'] = tier;
  return headers;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateFarmerVerificationRequest(request).catch((error: unknown) => {
    console.error('[api/v2/farmers/verification] auth lookup failed', { error });
    return null;
  });

  if (!auth) {
    return NextResponse.json(
      { error: 'Authentication is temporarily unavailable' },
      { status: 503, headers: responseHeaders() }
    );
  }
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: responseHeaders() }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.', details: [] },
      { status: 400, headers: responseHeaders(auth.client.tier) }
    );
  }

  const parsed = parseVerificationAddresses(body);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: `addresses must be 1–${MAX_BATCH_ADDRESSES} well-formed Stellar public keys.`,
        details: parsed.errors,
      },
      { status: 400, headers: responseHeaders(auth.client.tier) }
    );
  }

  try {
    const batch = await verifyFarmers(getPool(), parsed.addresses);
    return NextResponse.json(batch, { headers: responseHeaders(auth.client.tier) });
  } catch (error) {
    console.error('[api/v2/farmers/verification] batch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders(auth.client.tier) }
    );
  }
}
