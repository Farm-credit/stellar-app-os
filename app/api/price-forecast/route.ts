import { NextResponse } from 'next/server';
import { forecastCarbonCreditPrice } from '@/lib/services/price-forecasting';
import type { PriceForecastInput } from '@/lib/types/price-forecast';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const input = (await request.json()) as PriceForecastInput;
    return NextResponse.json({ forecast: forecastCarbonCreditPrice(input) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to generate forecast' },
      { status: 400 }
    );
  }
}
