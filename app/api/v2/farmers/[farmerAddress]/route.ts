/**
 * GET /api/v2/farmers/{farmerAddress} — Farm-credit/stellar-app-os#1387
 *
 * Farmer profile endpoint returning profile details, summary metrics,
 * and project portfolio overview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  FarmerNotFoundError,
  getFarmerPortfolio,
  isStellarAddress,
} from '@/lib/api/farmer-portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ farmerAddress: string }> };

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { farmerAddress } = await context.params;

    if (!farmerAddress || !isStellarAddress(farmerAddress.trim())) {
      return NextResponse.json(
        {
          error:
            'farmerAddress must be a 56-character Stellar public key starting with G.',
          code: 'invalid_address',
        },
        { status: 400, headers: responseHeaders() }
      );
    }

    const portfolio = await getFarmerPortfolio(farmerAddress.trim());
    return NextResponse.json(portfolio, { headers: responseHeaders() });
  } catch (error) {
    if (error instanceof FarmerNotFoundError) {
      return NextResponse.json(
        { error: 'Farmer not found', code: 'not_found' },
        { status: 404, headers: responseHeaders() }
      );
    }
    console.error('[api/v2/farmers/[farmerAddress]] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
