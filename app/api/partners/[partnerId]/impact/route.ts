/**
 * GET /api/partners/:partnerId/impact
 *
 * Consolidated impact feed for a white-label partner admin panel: every
 * project in the partner's portfolio plus summed totals across the five
 * impact dimensions. (#1713)
 *
 * Responses:
 *   200  { feed: PartnerImpactFeed }
 *   404  { error: "Partner not found" }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { buildPartnerImpactFeed, getWhiteLabelConfig } from '@/lib/whiteLabel';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;
  const config = getWhiteLabelConfig(partnerId);

  if (!config) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }

  const feed = buildPartnerImpactFeed(config);

  return NextResponse.json(
    { feed },
    {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10' },
    }
  );
}
