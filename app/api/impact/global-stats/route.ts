/**
 * GET /api/impact/global-stats
 *
 * Returns platform-wide sponsor impact statistics for comparison:
 * - average CO2 offset per sponsor
 * - median CO2 offset per sponsor
 * - total sponsors count
 * - percentile distribution thresholds
 *
 * Results are cached server-side for 60 seconds.
 *
 * Responses:
 *   200  GlobalSponsorStats JSON
 *   500  { error: string }
 *
 * Closes #1006
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getGlobalSponsorStats } from '@/lib/api/carbon-impact';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const stats = await getGlobalSponsorStats();

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'X-Cached-At': stats.cachedAt,
      },
    });
  } catch (err) {
    console.error('[api/impact/global-stats] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
