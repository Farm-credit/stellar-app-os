import { NextResponse } from 'next/server';
import { IMPACT_DATA } from '@/lib/api/impactData';

export function GET() {
  return NextResponse.json(IMPACT_DATA, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
