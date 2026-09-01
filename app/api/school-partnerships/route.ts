import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { createSchoolPartnership, listSchoolPartnerships } from '@/lib/services/school-partnership';
import type { CreateSchoolPartnershipInput } from '@/lib/types/school-partnership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/school-partnerships
 *
 * List active school partnerships.
 * Query params:
 *   country — filter by ISO country code
 *   limit   — max results (default 50)
 *   offset  — pagination offset
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const country = url.searchParams.get('country') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  try {
    const partnerships = await listSchoolPartnerships(getPool(), {
      country,
      limit: limitParam ? Number.parseInt(limitParam, 10) : undefined,
      offset: offsetParam ? Number.parseInt(offsetParam, 10) : undefined,
    });

    return NextResponse.json(partnerships, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[school-partnerships] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch school partnerships' }, { status: 500 });
  }
}

/**
 * POST /api/school-partnerships
 *
 * Create a new school partnership.
 * Body: CreateSchoolPartnershipInput
 */
export async function POST(request: Request) {
  let body: CreateSchoolPartnershipInput;
  try {
    body = (await request.json()) as CreateSchoolPartnershipInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.school_name?.trim() || !body.contact_name?.trim() || !body.contact_email?.trim()) {
    return NextResponse.json(
      { error: 'school_name, contact_name, and contact_email are required' },
      { status: 400 }
    );
  }

  // Basic email validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email)) {
    return NextResponse.json({ error: 'Invalid contact_email' }, { status: 400 });
  }

  try {
    const result = await createSchoolPartnership(getPool(), body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create partnership';
    console.error('[school-partnerships] POST error', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
