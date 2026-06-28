/**
 * GET /api/impact/:sponsor
 *
 * Returns the total CO2 offset, tree count, and per-species breakdown for a
 * given Stellar sponsor address by querying the CarbonCredits contract state.
 * Results are cached server-side for 30 seconds.
 *
 * Path params:
 *   sponsor  — Stellar public key (G… 56-char base32)
 *
 * Responses:
 *   200  SponsorImpact JSON
 *   400  { error: "Invalid Stellar address" }
 *   500  { error: string }
 *
 * Closes #545
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getSponsorImpact, isValidStellarAddress } from '@/lib/api/carbon-impact';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sponsor: string }> }
) {
  try {
    const { sponsor: rawSponsor } = await params;
    const sponsor = rawSponsor?.trim() ?? '';

    if (!sponsor) {
      return NextResponse.json({ error: 'sponsor address is required' }, { status: 400 });
    }

    if (!isValidStellarAddress(sponsor)) {
      return NextResponse.json(
        { error: 'Invalid Stellar address — must be a 56-character G… public key' },
        { status: 400 }
      );
    }

    const impact = await getSponsorImpact(sponsor);

    return NextResponse.json(impact, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
        'X-Cached-At': impact.cachedAt,
      },
    });
  } catch (err) {
    console.error('[api/impact/:sponsor] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
