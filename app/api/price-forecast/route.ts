/**
 * /api/price-forecast — Issue #1313
 *
 * Forward price curve for a carbon-credit series over the next 3–12 months.
 *
 * POST /api/price-forecast
 *   Body: PriceForecastInput (see `@/lib/types/price-forecast`).
 *   Optional `actuals: number[]` (oldest → newest) additionally scores the
 *   model against realised closes and returns a `backtest` block.
 *
 *   → 200 { forecast, backtest? }
 *   → 400 { error, details: string[] }
 *
 * GET /api/price-forecast
 *   → 200 { model, horizons, inputs, example } — self-describing metadata so
 *     integrators can build requests without out-of-band documentation.
 */

import { NextResponse } from 'next/server';
import {
  FORECAST_MODEL_VERSION,
  MODEL,
  backtestPriceForecast,
  forecastCarbonCreditPrice,
  validatePriceForecastInput,
} from '@/lib/services/price-forecasting';
import type { PriceForecastInput } from '@/lib/types/price-forecast';

export const runtime = 'nodejs';

const SUPPORTED_HORIZONS = [3, 6, 9, 12];

const EXAMPLE_INPUT: PriceForecastInput = {
  currentPrice: 42.5,
  supplyGrowthPercent: 4,
  demandGrowthPercent: 9,
  policyMomentum: 0.35,
  seasonalIndex: 0.1,
  horizonMonths: 6,
};

export function GET(): NextResponse {
  return NextResponse.json({
    model: { version: FORECAST_MODEL_VERSION, coefficients: MODEL },
    horizons: SUPPORTED_HORIZONS,
    inputs: {
      required: ['currentPrice', 'supplyGrowthPercent', 'demandGrowthPercent'],
      optional: [
        'policyMomentum',
        'seasonalIndex',
        'horizonMonths',
        'recentMonthlyPrices',
        'equilibriumPrice',
      ],
      notes:
        'recentMonthlyPrices calibrates volatility; equilibriumPrice anchors long-run mean reversion.',
    },
    example: EXAMPLE_INPUT,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: (PriceForecastInput & { actuals?: number[] }) | null = null;

  try {
    body = (await request.json()) as PriceForecastInput & { actuals?: number[] };
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const { actuals, ...input } = body ?? {};
  const details = validatePriceForecastInput(input);
  if (details.length > 0) {
    return NextResponse.json({ error: 'Invalid forecast request', details }, { status: 400 });
  }

  try {
    const forecast = forecastCarbonCreditPrice(input);
    const backtest =
      Array.isArray(actuals) && actuals.length > 0
        ? backtestPriceForecast(input, actuals)
        : undefined;

    return NextResponse.json(backtest ? { forecast, backtest } : { forecast });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to generate forecast',
        details: [error instanceof Error ? error.message : 'Unknown error'],
      },
      { status: 400 }
    );
  }
}
