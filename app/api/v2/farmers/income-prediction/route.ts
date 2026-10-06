/**
 * /api/v2/farmers/income-prediction — Issue #1421
 *
 * Predicts potential farmer income from a carbon project.
 *
 * GET /api/v2/farmers/income-prediction
 *   ?landSizeHectares=12.5          required, 0 < x ≤ 100000
 *   &region=africa                  required (see CARBON_REGIONS)
 *   &practiceType=agroforestry      required (see FARMING_PRACTICES)
 *   &projectYears=10                optional, 1..30 (default 10)
 *
 * POST /api/v2/farmers/income-prediction
 *   Same fields as JSON.
 *
 * Responses:
 *   200  { prediction: IncomePrediction }
 *   400  { error, details: string[] }   — validation failure
 *   500  { error }
 */

import { NextResponse } from 'next/server';
import {
  parseIncomePredictionInput,
  parseIncomePredictionQuery,
  predictFarmerIncome,
  type IncomePredictionParseResult,
} from '@/lib/api/farmer-income-prediction';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const headers = {
  // Same inputs give the same prediction until the price history moves.
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
  ...(apiVersionHeaders('v2') as Record<string, string>),
};

function respond(parsed: IncomePredictionParseResult): NextResponse {
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Invalid income prediction request', details: parsed.errors },
      { status: 400, headers }
    );
  }

  try {
    return NextResponse.json({ prediction: predictFarmerIncome(parsed.data) }, { headers });
  } catch (error) {
    console.error('[api/v2/farmers/income-prediction] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers }
    );
  }
}

export function GET(request: Request): NextResponse {
  return respond(parseIncomePredictionQuery(new URL(request.url).searchParams));
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid income prediction request', details: ['Request body must be valid JSON'] },
      { status: 400, headers }
    );
  }
  return respond(parseIncomePredictionInput(body));
}
