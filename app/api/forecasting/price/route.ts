import { NextResponse } from 'next/server';
import {
  forecastCarbonCreditPrice,
  validatePriceForecastInput,
} from '@/lib/services/price-forecasting';
import type { PriceForecastInput } from '@/lib/types/price-forecast';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<PriceForecastInput> & {
      projectId?: string;
      supplyGrowthPct?: number;
      demandGrowthPct?: number;
      policyIndex?: number;
    };
    const input: PriceForecastInput = {
      currentPrice: body.currentPrice as number,
      supplyGrowthPercent: body.supplyGrowthPercent ?? body.supplyGrowthPct ?? Number.NaN,
      demandGrowthPercent: body.demandGrowthPercent ?? body.demandGrowthPct ?? Number.NaN,
      policyMomentum: body.policyMomentum ?? body.policyIndex,
      seasonalIndex: body.seasonalIndex,
      horizonMonths: body.horizonMonths,
      recentMonthlyPrices: body.recentMonthlyPrices,
      equilibriumPrice: body.equilibriumPrice,
    };
    const details = validatePriceForecastInput(input);
    if (details.length) {
      return NextResponse.json({ error: 'Invalid forecast request', details }, { status: 400 });
    }
    const forecast = forecastCarbonCreditPrice(input);
    return NextResponse.json({
      ...forecast,
      projectId: body.projectId,
      modelVersion: forecast.methodologyVersion,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to forecast price' },
      { status: 400 }
    );
  }
}
