/**
 * POST /api/v1/farmers/verification
 *
 * Batch verification for partner portfolios. Submit 1–100 unique Stellar
 * public keys as { addresses: string[] }.
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
    ...(apiVersionHeaders('v1') as Record<string, string>),
  };
  if (tier) headers['X-API-Tier'] = tier;
  return headers;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const batch = await verifyFarmers(getPool(), parsed.addresses, 'v1');
    return NextResponse.json(batch, { headers: responseHeaders(auth.client.tier) });
  } catch (error) {
    console.error('[api/v1/farmers/verification] batch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders(auth.client.tier) }
    );
  }
}
