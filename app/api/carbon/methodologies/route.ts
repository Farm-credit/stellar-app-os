/**
 * GET /api/carbon/methodologies
 *
 * Lists carbon calculation methodologies from the methodology library.
 *
 * Query params (all optional):
 *   category  reforestation | soil_sequestration | renewable_energy |
 *             methane_reduction | energy_efficiency
 *   standard  issuing programme, e.g. "Verra VCS", "CDM" (case-insensitive)
 *   q         search across code, name and description
 *   limit     page size, 1-100 (default 20)
 *   offset    rows to skip (default 0)
 *
 * Responses:
 *   200  { methodologies, totalCount, limit, offset }
 *   400  { error, details }   invalid query parameters
 *   500  { error }
 */

import { NextResponse } from 'next/server';
import {
  listMethodologies,
  listMethodologiesQuerySchema,
} from '@/backend/src/services/carbonMethodologies';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value !== '') raw[key] = value;
  }

  const parsed = listMethodologiesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid query parameters',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await listMethodologies(parsed.data));
  } catch (err) {
    logger.error('[carbon-methodologies] list failed', { err });
    return NextResponse.json({ error: 'Failed to fetch methodologies' }, { status: 500 });
  }
}
