import { NextResponse } from 'next/server';
import { IMPACT_DATA } from '@/lib/api/impactData';

export function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status');
  const filteredRegions =
    status && status !== 'all'
      ? IMPACT_DATA.regions.filter((region) => region.name.toLowerCase().includes(status.toLowerCase()))
      : IMPACT_DATA.regions;

  return NextResponse.json(
    {
      ...IMPACT_DATA,
      regions: filteredRegions,
    },
    {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    }
  );
}
