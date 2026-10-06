/**
 * POST /api/v1/carbon-impact — Issue #1333
 *
 * Public v1 contract for the carbon impact calculator: takes company
 * emissions data (employees, energy, vehicles), computes the annual
 * footprint in CO2e and returns the carbon credits required for a full
 * offset, together with recommendations.
 *
 * Read-only and stateless — nothing is persisted, so the v1 response shape
 * is a frozen contract: fields may be added, existing ones will not be
 * removed or renamed.
 *
 * Request body (CarbonImpactRequest):
 *   {
 *     employees: number,                        // required, > 0
 *     energy: {
 *       electricityKwh: number,                 // default 0
 *       naturalGasTherms: number,               // default 0
 *       renewablePercentage: number,            // 0–100, default 0
 *     },
 *     vehicles: {
 *       gasolineLiters: number,                 // default 0
 *       dieselLiters: number,                   // default 0
 *       electricKwh: number,                    // default 0
 *     }
 *   }
 *
 * Responses:
 *   200  CarbonImpactResult — emissions, per-employee intensity and
 *        `recommendations.creditsNeeded` (1 credit = 1 tCO2e)
 *   400  { error, details }                     — validation failure
 *
 * Closes #1333
 */

import { NextResponse } from 'next/server';
import { calculateCarbonImpact, carbonImpactRequestSchema } from '@/lib/api/carbon-company-impact';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    // Deterministic for a given body, but the calculator is cheap — no
    // reason to cache company data anywhere but the client.
    'Cache-Control': 'private, no-store',
    ...(apiVersionHeaders('v1') as Record<string, string>),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: responseHeaders() }
    );
  }

  const parsed = carbonImpactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid carbon impact request',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400, headers: responseHeaders() }
    );
  }

  return NextResponse.json(calculateCarbonImpact(parsed.data), {
    headers: responseHeaders(),
  });
}
