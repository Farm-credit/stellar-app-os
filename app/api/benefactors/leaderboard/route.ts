import { NextRequest, NextResponse } from 'next/server';
import {
  getBenefactorLeaderboard,
  type BenefactorFilterType,
  type BenefactorPeriod,
  type BenefactorSortBy,
} from '@/lib/benefactors/leaderboard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type') ?? undefined;
    const periodParam = searchParams.get('period') ?? undefined;
    const sortByParam = searchParams.get('sortBy') ?? undefined;
    const searchParam = searchParams.get('search') ?? undefined;
    const limitParam = searchParams.get('limit');

    let parsedLimit: number | undefined;
    if (limitParam !== null && limitParam !== '') {
      const numericLimit = Number(limitParam);
      if (Number.isInteger(numericLimit) && numericLimit > 0) {
        parsedLimit = numericLimit;
      } else {
        console.warn(
          `[API /api/benefactors/leaderboard] Ignoring invalid limit param: "${limitParam}"`
        );
      }
    }

    const result = getBenefactorLeaderboard({
      type: typeParam as BenefactorFilterType | undefined,
      period: periodParam as BenefactorPeriod | undefined,
      sortBy: sortByParam as BenefactorSortBy | undefined,
      search: searchParam,
      limit: parsedLimit,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[API /api/benefactors/leaderboard] Failed to build leaderboard:', error);
    return NextResponse.json(
      { error: 'Unable to load benefactor leaderboard at this time.' },
      { status: 500 }
    );
  }
}
