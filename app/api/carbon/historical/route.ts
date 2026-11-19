import { NextRequest, NextResponse } from 'next/server';
import { historicalCarbonDataService } from '@/lib/services/historicalCarbonDataService';
import type { HistoricalCarbonDataResponse } from '@/types/carbon';

export const dynamic = 'force-dynamic';

const VALID_GRANULARITIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
type Granularity = (typeof VALID_GRANULARITIES)[number];

function isValidDate(value: string): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const granularityParam = searchParams.get('granularity') ?? 'monthly';
    const region = searchParams.get('region') ?? undefined;
    const projectType = searchParams.get('projectType') ?? undefined;

    if (!startDate || !isValidDate(startDate)) {
      return NextResponse.json(
        { error: 'Invalid or missing startDate parameter. Expected ISO date string.' },
        { status: 400 },
      );
    }

    if (!endDate || !isValidDate(endDate)) {
      return NextResponse.json(
        { error: 'Invalid or missing endDate parameter. Expected ISO date string.' },
        { status: 400 },
      );
    }

    if (Date.parse(startDate) > Date.parse(endDate)) {
      return NextResponse.json(
        { error: 'startDate must be before or equal to endDate.' },
        { status: 400 },
      );
    }

    if (!VALID_GRANULARITIES.includes(granularityParam as Granularity)) {
      return NextResponse.json(
        {
          error: `Invalid granularity parameter. Expected one of: ${VALID_GRANULARITIES.join(', ')}.`,
        },
        { status: 400 },
      );
    }

    const granularity = granularityParam as Granularity;

    const data: HistoricalCarbonDataResponse = await historicalCarbonDataService.getHistoricalData({
      startDate,
      endDate,
      granularity,
      region,
      projectType,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error fetching historical carbon data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical carbon data.' },
      { status: 500 },
    );
  }
}