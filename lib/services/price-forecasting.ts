/**
 * Carbon-credit price forecasting engine (#1313).
 *
 * Produces a 3–12 month forward curve for a credit series from four signal
 * groups the issue calls out explicitly:
 *
 *   1. supply growth      — new issuances coming to market push prices down
 *   2. demand growth      — retirement/voluntary demand pulls prices up
 *   3. policy momentum    — regulatory tightening / Article 6 signals
 *   4. seasonality        — issuance (Q1) and compliance demand (Q4) cycles
 *
 * The model is intentionally transparent and dependency-free (no Python/ML
 * runtime): a supply/demand elasticity term, a policy term and a seasonal term
 * combine into a monthly log drift, optional mean reversion anchors the curve
 * to a long-run equilibrium, and a volatility estimate widens the prediction
 * band as the horizon grows. Every coefficient lives in `MODEL` so a future
 * model can be versioned rather than silently changed.
 */

import type {
  PriceForecast,
  PriceForecastBacktest,
  PriceForecastInput,
  PriceForecastPoint,
} from '@/lib/types/price-forecast';

export const FORECAST_MODEL_VERSION = '2026.2';

/** Tunable coefficients for the v2026.2 model. */
export const MODEL = {
  /** Log-drift contribution per unit of net supply/demand growth. */
  elasticity: 0.18,
  /** Log-drift contribution of a full-swing policy signal (±1). */
  policyWeight: 0.08,
  /** Log-drift contribution of a full-swing explicit seasonal signal (±1). */
  seasonalWeight: 0.04,
  /** Peak-to-trough amplitude of the month-of-year issuance/demand cycle. */
  calendarAmplitude: 0.03,
  /** Month (1–12) at which the calendar seasonal factor peaks. */
  calendarPeakMonth: 11,
  /** Fraction of the equilibrium gap closed per month when mean-reverting. */
  reversionSpeed: 0.12,
  /** Default annualised volatility when no price history is supplied. */
  defaultVolatility: 0.18,
  /** Floor on the annualised volatility estimate. */
  minVolatility: 0.05,
  /** Cap on the annualised volatility estimate. */
  maxVolatility: 0.6,
  /** z-multiplier applied to σ√t to build the prediction band. */
  bandZ: 1.28,
} as const;

const ALLOWED_HORIZONS = [3, 6, 9, 12] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/** Validate a forecast request and return every problem found, not just the first. */
export function validatePriceForecastInput(input: Partial<PriceForecastInput>): string[] {
  const errors: string[] = [];

  if (!Number.isFinite(input.currentPrice) || (input.currentPrice ?? 0) <= 0) {
    errors.push('currentPrice must be greater than zero');
  }
  if (!Number.isFinite(input.supplyGrowthPercent)) {
    errors.push('supplyGrowthPercent must be a finite number');
  }
  if (!Number.isFinite(input.demandGrowthPercent)) {
    errors.push('demandGrowthPercent must be a finite number');
  }
  if (input.policyMomentum !== undefined && !Number.isFinite(input.policyMomentum)) {
    errors.push('policyMomentum must be a finite number when supplied');
  }
  if (input.seasonalIndex !== undefined && !Number.isFinite(input.seasonalIndex)) {
    errors.push('seasonalIndex must be a finite number when supplied');
  }
  if (
    input.equilibriumPrice !== undefined &&
    (!Number.isFinite(input.equilibriumPrice) || input.equilibriumPrice <= 0)
  ) {
    errors.push('equilibriumPrice must be greater than zero when supplied');
  }
  if (input.horizonMonths !== undefined) {
    if (!Number.isInteger(input.horizonMonths)) {
      errors.push('horizonMonths must be an integer');
    } else if (
      !ALLOWED_HORIZONS.includes(input.horizonMonths as (typeof ALLOWED_HORIZONS)[number])
    ) {
      errors.push(`horizonMonths must be one of ${ALLOWED_HORIZONS.join(', ')}`);
    }
  }
  if (input.recentMonthlyPrices !== undefined) {
    const history = input.recentMonthlyPrices;
    if (!Array.isArray(history) || history.length < 2) {
      errors.push('recentMonthlyPrices must contain at least two closes');
    } else if (history.some((price) => !Number.isFinite(price) || price <= 0)) {
      errors.push('recentMonthlyPrices must all be greater than zero');
    }
  }

  return errors;
}

/** Sample mean of a non-empty series. */
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Annualised volatility from monthly log returns. Returns `null` when there is
 * not enough history to measure it.
 */
export function estimateAnnualVolatility(monthlyPrices: number[]): number | null {
  if (monthlyPrices.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < monthlyPrices.length; i++) {
    returns.push(Math.log(monthlyPrices[i] / monthlyPrices[i - 1]));
  }
  if (returns.length === 0) return null;
  const avg = mean(returns);
  const variance =
    returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

/**
 * Month-of-year seasonal multiplier. Carbon issuance clusters early in the year
 * while northern-hemisphere compliance demand peaks late, so the factor is a
 * single sinusoid peaking in `calendarPeakMonth`.
 */
function calendarSeasonalFactor(month: number): number {
  const phase = ((month - MODEL.calendarPeakMonth) / 12) * 2 * Math.PI;
  return 1 + MODEL.calendarAmplitude * Math.sin(phase);
}

/** First day of the month `offset` months after `from`, as `YYYY-MM`. */
function monthKey(from: Date, offset: number): string {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * Build the forward curve for a carbon-credit series.
 *
 * @param input Supply/demand/policy/seasonality signals (see `PriceForecastInput`).
 * @param now   Anchor date for the curve; defaults to the current time.
 * @throws Error when the input fails validation.
 */
export function forecastCarbonCreditPrice(
  input: PriceForecastInput,
  now: Date = new Date()
): PriceForecast {
  const errors = validatePriceForecastInput(input);
  if (errors.length > 0) throw new Error(errors.join('; '));

  const horizon = input.horizonMonths ?? 12;

  // ── Signal decomposition ───────────────────────────────────────────────────
  const supplyDemand = clamp(
    (input.demandGrowthPercent - input.supplyGrowthPercent) / 100,
    -0.5,
    0.5
  );
  const policy = clamp(input.policyMomentum ?? 0, -1, 1) * MODEL.policyWeight;
  const seasonality = clamp(input.seasonalIndex ?? 0, -1, 1) * MODEL.seasonalWeight;
  const annualDrift = supplyDemand * MODEL.elasticity + policy + seasonality;

  // ── Volatility ─────────────────────────────────────────────────────────────
  const measuredVolatility = input.recentMonthlyPrices
    ? estimateAnnualVolatility(input.recentMonthlyPrices)
    : null;
  const volatility = clamp(
    measuredVolatility ?? MODEL.defaultVolatility,
    MODEL.minVolatility,
    MODEL.maxVolatility
  );

  // ── Mean reversion ─────────────────────────────────────────────────────────
  const equilibrium = input.equilibriumPrice;
  const meanReversion =
    equilibrium && equilibrium > 0
      ? clamp((equilibrium - input.currentPrice) / equilibrium, -1, 1)
      : 0;

  // ── Curve ──────────────────────────────────────────────────────────────────
  const points: PriceForecastPoint[] = [];
  for (let month = 1; month <= horizon; month++) {
    const t = month / 12; // years from now
    const driftComponent = input.currentPrice * Math.exp(annualDrift * t);
    const reversionComponent =
      equilibrium && equilibrium > 0
        ? (equilibrium - driftComponent) * (1 - Math.exp(-MODEL.reversionSpeed * month))
        : 0;
    const calendarFactor = calendarSeasonalFactor(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + month, 1)).getUTCMonth() + 1
    );
    const predicted = (driftComponent + reversionComponent) * calendarFactor;

    // Uncertainty grows with √t, the standard random-walk result.
    const band = predicted * MODEL.bandZ * volatility * Math.sqrt(t);

    points.push({
      month: monthKey(now, month),
      horizonMonths: month,
      predictedPrice: round(predicted),
      lowerBound: round(Math.max(0, predicted - band)),
      upperBound: round(predicted + band),
      confidence: round(clamp(1 - volatility * Math.sqrt(t), 0.4, 0.95), 2),
    });
  }

  return {
    generatedAt: now.toISOString(),
    methodologyVersion: FORECAST_MODEL_VERSION,
    input: { ...input, horizonMonths: horizon },
    points,
    drivers: {
      supplyDemand: round(supplyDemand, 4),
      policy: round(policy, 4),
      seasonality: round(seasonality, 4),
      annualDrift: round(annualDrift, 4),
      volatility: round(volatility, 4),
      meanReversion: round(meanReversion, 4),
    },
  };
}

/**
 * Replay the model over historical closes to report out-of-sample accuracy.
 * `actualMonthlyPrices` is ordered oldest → newest and is matched against the
 * curve month-by-month, so only the overlap is scored.
 */
export function backtestPriceForecast(
  input: PriceForecastInput,
  actualMonthlyPrices: number[],
  now: Date = new Date()
): PriceForecastBacktest {
  if (!Array.isArray(actualMonthlyPrices) || actualMonthlyPrices.length === 0) {
    throw new Error('actualMonthlyPrices must contain at least one close');
  }

  const forecast = forecastCarbonCreditPrice(input, now);
  const evaluated = Math.min(forecast.points.length, actualMonthlyPrices.length);
  const points: PriceForecastBacktest['points'] = [];

  let absolutePercentageError = 0;
  let squaredError = 0;
  let insideBand = 0;

  for (let i = 0; i < evaluated; i++) {
    const predicted = forecast.points[i];
    const actualPrice = actualMonthlyPrices[i];
    const inBand = actualPrice >= predicted.lowerBound && actualPrice <= predicted.upperBound;
    absolutePercentageError += Math.abs((actualPrice - predicted.predictedPrice) / actualPrice);
    squaredError += (actualPrice - predicted.predictedPrice) ** 2;
    if (inBand) insideBand++;
    points.push({
      month: predicted.month,
      predictedPrice: predicted.predictedPrice,
      actualPrice: round(actualPrice),
      insideBand: inBand,
    });
  }

  return {
    evaluatedMonths: evaluated,
    mape: round(absolutePercentageError / evaluated, 4),
    rmse: round(Math.sqrt(squaredError / evaluated)),
    bandHitRate: round(insideBand / evaluated, 4),
    points,
  };
}
