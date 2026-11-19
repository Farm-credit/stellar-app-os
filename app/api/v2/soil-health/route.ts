/**
 * POST /api/v2/soil-health — Issue #1386
 *
 * Calculate soil health improvement scores for regenerative farming practices.
 * Award bonus carbon credits for soil sequestration above baseline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  calculateSoilHealthScore,
  type SoilMeasurementInput,
} from '@/lib/services/soil-health';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SoilMeasurementInput;

    if (!body.plotId || !body.farmerAddress || body.acres <= 0) {
      return NextResponse.json(
        { error: 'plotId, farmerAddress, and positive acres are required.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    if (body.measuredSocBps <= body.baselineSocBps) {
      return NextResponse.json(
        {
          error:
            'Measured Soil Organic Carbon must exceed baseline to qualify for regenerative incentives.',
        },
        { status: 400, headers: responseHeaders() }
      );
    }

    const scoreResult = calculateSoilHealthScore(body);
    return NextResponse.json(scoreResult, { headers: responseHeaders() });
  } catch (error) {
    console.error('[api/v2/soil-health] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
