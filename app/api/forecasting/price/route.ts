import { NextResponse } from 'next/server';
import { buildPriceForecast } from '@/lib/forecasting/price-forecast';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(buildPriceForecast(body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to forecast price' },
      { status: 400 }
    );
  }
}
