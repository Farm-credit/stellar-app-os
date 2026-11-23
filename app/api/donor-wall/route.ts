/**
 * GET /api/donor-wall — Issue #1656
 *
 * Public donor recognition wall: opted-in sponsors with 10+ trees funded,
 * grouped client-side by tier. Rankings come from a weekly snapshot.
 * Wallet addresses are never returned.
 */

import { NextResponse } from 'next/server';
import { getDonorWall } from '@/lib/donor-wall/service';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const wall = await getDonorWall();
    return NextResponse.json(wall, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    logger.error('[api:donor-wall] Failed to load donor wall', { err });
    return NextResponse.json({ error: 'Failed to load donor wall' }, { status: 500 });
  }
}
