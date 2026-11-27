import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTreeSponsorLeaderboard } from '@/lib/leaderboard/treeSponsors';
import { leaderboardPeriodSchema, sponsorTypeSchema } from '@/lib/leaderboard/treeSponsorsSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: NextRequest) {
  const period = leaderboardPeriodSchema.safeParse(
    request.nextUrl.searchParams.get('period') ?? 'monthly'
  );
  const sponsorType = sponsorTypeSchema.safeParse(
    request.nextUrl.searchParams.get('type') ?? 'individual'
  );
  if (!period.success || !sponsorType.success) {
    return NextResponse.json(
      { error: 'Invalid leaderboard period or sponsor type.' },
      { status: 400, headers }
    );
  }
  try {
    return NextResponse.json(await getTreeSponsorLeaderboard(period.data, sponsorType.data), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'The leaderboard is temporarily unavailable.' },
      { status: 503, headers }
    );
  }
}
