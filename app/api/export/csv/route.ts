/**
 * GET /api/export/csv
 *
 * Download tree, sponsor, or planter data as a CSV file with optional
 * date-range and field-level filters.
 *
 * Query parameters:
 *   type        — required: "trees" | "sponsors" | "planters"
 *   startDate   — optional ISO-8601 date, inclusive lower bound
 *   endDate     — optional ISO-8601 date, inclusive upper bound
 *   status      — optional status filter (entity-specific)
 *   projectId   — optional project identifier (trees only)
 *   limit       — optional row cap (default 10 000, max 50 000)
 *
 * Authentication:
 *   Requires a valid JWT in the Authorization header (Bearer token).
 *   Sponsor role may only export their own trees; admin role may export all.
 *
 * Closes #1116
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  generateTreesCsv,
  generateSponsorsCsv,
  generatePlantersCsv,
  type ExportFilters,
} from '@/backend/src/services/csvExport';
import { verifyPlanterJwt } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

const ALLOWED_TYPES = ['trees', 'sponsors', 'planters'] as const;
type ExportType = (typeof ALLOWED_TYPES)[number];

function isValidDate(value: string | null): boolean {
  if (!value) return true; // optional field
  return !isNaN(Date.parse(value));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ------------------------------------------------------------------
  // Authentication — require a valid JWT
  // ------------------------------------------------------------------
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyPlanterJwt(token);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ------------------------------------------------------------------
  // Parameter parsing & validation
  // ------------------------------------------------------------------
  const p = request.nextUrl.searchParams;

  const type = p.get('type') as ExportType | null;
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid or missing "type" parameter. Must be one of: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const startDate = p.get('startDate');
  const endDate = p.get('endDate');

  if (!isValidDate(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate — must be ISO-8601' }, { status: 400 });
  }
  if (!isValidDate(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate — must be ISO-8601' }, { status: 400 });
  }

  const rawLimit = p.get('limit');
  const limit = rawLimit ? parseInt(rawLimit, 10) : undefined;
  if (rawLimit && (isNaN(Number(limit)) || Number(limit) < 1)) {
    return NextResponse.json(
      { error: 'Invalid limit — must be a positive integer' },
      { status: 400 }
    );
  }

  const filters: ExportFilters = {
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    status: p.get('status') ?? undefined,
    projectId: p.get('projectId') ?? undefined,
    limit,
  };

  // ------------------------------------------------------------------
  // Generate CSV
  // ------------------------------------------------------------------
  try {
    const pool = getPool();

    let csv: string;
    let filename: string;

    switch (type) {
      case 'trees':
        csv = await generateTreesCsv(pool, filters);
        filename = `trees-export-${Date.now()}.csv`;
        break;
      case 'sponsors':
        csv = await generateSponsorsCsv(pool, filters);
        filename = `sponsors-export-${Date.now()}.csv`;
        break;
      case 'planters':
        csv = await generatePlantersCsv(pool, filters);
        filename = `planters-export-${Date.now()}.csv`;
        break;
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/export/csv] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
