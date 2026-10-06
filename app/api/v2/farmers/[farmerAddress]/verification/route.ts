/**
 * GET /api/v2/farmers/{address}/verification — Farm-credit/stellar-app-os#1403
 *
 * A third-party verification endpoint for partner platforms and financial
 * institutions. It answers three questions about a farmer in one call:
 *
 *   - identity: verified against the farmer's identity document?
 *   - land:     plot and declared tenure confirmed by a verifier?
 *   - credit:   is the farmer currently credit-eligible, and on what tier?
 *
 * Authentication
 * --------------
 * Requires an `x-api-key` header carrying a key issued via `POST /api/api-keys`
 * (see `docs/PUBLIC_API.md`). `proxy.ts` enforces the tiered hourly rate limit;
 * this handler re-resolves the key so the endpoint is safe even if reached by a
 * path the proxy matcher does not cover.
 *
 * Responses
 * ---------
 *   200  FarmerVerificationReport
 *   400  { error, code: 'invalid_address' }
 *   401  { error }                                   — missing/invalid key
 *   403  { error, code: 'consent_denied' }           — farmer has not consented
 *   404  { error, code: 'not_found' }                — no verification record
 *   500  { error }
 *   503  { error }                                   — auth lookup unavailable
 *
 * No PII is ever returned; see `lib/api/farmer-verification.ts` for the
 * privacy boundary.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { authenticateFarmerVerificationRequest } from '@/lib/api/farmer-verification-auth';
import { getFarmerVerification, isStellarAddress } from '@/lib/api/farmer-verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ farmerAddress: string }> };

function responseHeaders(tier?: string): Record<string, string> {
  const headers: Record<string, string> = {
    // Verification data is per-farmer and consent-bound: never cache publicly.
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
  if (tier) headers['X-API-Tier'] = tier;
  return headers;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
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

  const { farmerAddress } = await context.params;
  if (!isStellarAddress(farmerAddress)) {
    return NextResponse.json(
      {
        error: 'farmerAddress must be a 56-character Stellar public key starting with G.',
        code: 'invalid_address',
      },
      { status: 400, headers: responseHeaders(auth.client.tier) }
    );
  }

  try {
    const result = await getFarmerVerification(getPool(), farmerAddress.trim());

    if (!result.ok) {
      if (result.reason === 'consent_denied') {
        return NextResponse.json(
          {
            error: 'The farmer has not granted consent for third-party verification.',
            code: 'consent_denied',
          },
          { status: 403, headers: responseHeaders(auth.client.tier) }
        );
      }
      return NextResponse.json(
        { error: 'No verification record found for this farmer.', code: 'not_found' },
        { status: 404, headers: responseHeaders(auth.client.tier) }
      );
    }

    return NextResponse.json(result.report, { headers: responseHeaders(auth.client.tier) });
  } catch (error) {
    console.error('[api/v2/farmers/[farmerAddress]/verification] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders(auth.client.tier) }
    );
  }
}
