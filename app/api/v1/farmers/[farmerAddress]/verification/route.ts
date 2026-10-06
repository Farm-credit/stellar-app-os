/**
 * GET /api/v1/farmers/{farmerAddress}/verification
 *
 * Third-party farmer verification for partner platforms and financial
 * institutions. The response contains verification assertions only; no PII
 * or evidence documents are disclosed.
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
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v1') as Record<string, string>),
  };
  if (tier) headers['X-API-Tier'] = tier;
  return headers;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await authenticateFarmerVerificationRequest(request).catch((error: unknown) => {
    console.error('[api/v1/farmers/verification] auth lookup failed', { error });
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
    const result = await getFarmerVerification(getPool(), farmerAddress.trim(), 'v1');

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
    console.error('[api/v1/farmers/[farmerAddress]/verification] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders(auth.client.tier) }
    );
  }
}
