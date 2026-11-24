/**
 * GET /api/carbon/methodologies/:slug
 *
 * Returns one methodology by slug (e.g. "vm0047", "ams-iii-d").
 *
 * Responses:
 *   200  { methodology }
 *   400  { error }   malformed slug
 *   404  { error }   not found
 *   500  { error }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getMethodologyBySlug } from '@/backend/src/services/carbonMethodologies';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  if (!SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: 'Invalid methodology slug' }, { status: 400 });
  }

  try {
    const methodology = await getMethodologyBySlug(slug);
    if (!methodology) {
      return NextResponse.json({ error: 'Methodology not found' }, { status: 404 });
    }
    return NextResponse.json({ methodology });
  } catch (err) {
    logger.error('[carbon-methodologies] get failed', { slug, err });
    return NextResponse.json({ error: 'Failed to fetch methodology' }, { status: 500 });
  }
}
