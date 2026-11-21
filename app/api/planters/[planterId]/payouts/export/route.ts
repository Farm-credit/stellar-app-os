/**
 * GET /api/planters/[planterId]/payouts/export
 *
 * Returns a CSV file of all payout transactions for a planter in a given
 * calendar year, intended for tax reporting.
 *
 * Query parameters:
 *   year   — 4-digit calendar year (required). e.g. ?year=2024
 *
 * Responses:
 *   200  text/csv        — payout CSV with Content-Disposition: attachment
 *   400  application/json — planterId or year param invalid
 *   404  application/json — planter not found or soft-deleted
 *   500  application/json — unexpected server error
 *
 * Authentication:
 *   Requires a valid planter JWT (Authorization: Bearer <token>).
 *   The JWT subject must match the planter's stellar_address so a planter
 *   cannot download another planter's tax data.
 *   Admin tokens (role === 'admin') bypass the subject check.
 *
 * Security notes:
 *   - planterId is parsed as a positive integer; non-numeric values → 400.
 *   - year is validated to be a plausible calendar year (1900–2100).
 *   - The CSV contains only the requesting planter's own data.
 *   - Response sets Cache-Control: no-store so the file is never cached.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPayoutsForPlanter, findActivePlanterById, payoutsToCsv } from '@/lib/db/payouts';
import { verifyPlanterJwt } from '@/lib/auth/jwt';

export const runtime = 'nodejs';

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteContext = {
  params: Promise<{ planterId: string }>;
};

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  // ── 1. Parse & validate route params ──────────────────────────────────────

  const { planterId: planterIdStr } = await context.params;

  const planterId = parsePositiveInt(planterIdStr);
  if (planterId === null) {
    return jsonError('planterId must be a positive integer', 400);
  }

  // ── 2. Parse & validate query params ──────────────────────────────────────

  const yearStr = request.nextUrl.searchParams.get('year');
  if (!yearStr) {
    return jsonError('Missing required query parameter: year', 400);
  }

  const year = parseYear(yearStr);
  if (year === null) {
    return jsonError('year must be a valid 4-digit calendar year (e.g. 2024)', 400);
  }

  // ── 3. Authenticate ───────────────────────────────────────────────────────
  //
  // We require a planter JWT.  Admins may use an admin JWT; in both cases
  // the same route handler can be reused by the admin console.

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return jsonError('Authorization header with Bearer token is required', 401);
  }

  const jwtPayload = await verifyPlanterJwt(token);
  if (!jwtPayload) {
    return jsonError('Invalid or expired token', 401);
  }

  // ── 4. Load planter record ─────────────────────────────────────────────────

  let planter: { id: number; stellar_address: string } | null;
  try {
    planter = await findActivePlanterById(planterId);
  } catch (err) {
    console.error('[payouts/export] DB error finding planter', { planterId, err });
    return jsonError('Internal server error', 500);
  }

  if (!planter) {
    return jsonError('Planter not found', 404);
  }

  // ── 5. Authorise: planter can only export their own data ───────────────────
  //
  // The JWT sub is the planter's Stellar address.
  // Admin JWTs have role === 'admin' — they bypass the ownership check.

  const isAdmin = (jwtPayload as { role?: string }).role === 'admin';
  if (!isAdmin && jwtPayload.sub !== planter.stellar_address) {
    return jsonError('Forbidden: you may only export your own payout data', 403);
  }

  // ── 6. Fetch payouts ───────────────────────────────────────────────────────

  let rows;
  try {
    rows = await getPayoutsForPlanter({ planterId: planter.id, taxYear: year });
  } catch (err) {
    console.error('[payouts/export] DB error fetching payouts', { planterId, year, err });
    return jsonError('Internal server error', 500);
  }

  // ── 7. Serialise to CSV ────────────────────────────────────────────────────

  const csv = payoutsToCsv(rows);

  const filename = `payouts-planter-${planterId}-${year}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
      // Inform clients how many rows are in the export (header row excluded)
      'X-Record-Count': String(rows.length),
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parses a string to a positive integer, or returns null on failure.
 * Guards against prototype-pollution via numeric-string injection.
 */
function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parses a 4-digit year string.  Accepts years 1900–2100 to cover all
 * plausible tax reporting scenarios without being overly permissive.
 */
function parseYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const n = parseInt(value, 10);
  return n >= 1900 && n <= 2100 ? n : null;
}
