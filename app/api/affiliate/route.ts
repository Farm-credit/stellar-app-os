import { NextResponse } from 'next/server';
import { getMockAffiliateProgram } from '@/lib/api/mock/affiliateProgram';

export const runtime = 'nodejs';

/**
 * GET /api/affiliate
 *
 * Returns the authenticated partner's affiliate program summary: their
 * current commission tier, aggregate stats, commission-band catalogue and
 * their recent referred sponsors. Currently backed by mock data; swap the
 * source for a database/Stellar query when the backend is ready.
 */
export function GET() {
  return NextResponse.json(getMockAffiliateProgram());
}
