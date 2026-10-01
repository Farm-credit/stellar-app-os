import { describe, expect, it } from 'vitest';
import {
  FORECAST_MODEL_VERSION,
  MODEL,
  backtestPriceForecast,
  estimateAnnualVolatility,
  forecastCarbonCreditPrice,
  validatePriceForecastInput,
} from '@/lib/services/price-forecasting';
import type { PriceForecastInput } from '@/lib/types/price-forecast';

const NOW = new Date('2026-01-15T00:00:00.000Z');

const baseInput: PriceForecastInput = {
  currentPrice: 40,
  supplyGrowthPercent: 2,
  demandGrowthPercent: 8,
  policyMomentum: 0.5,
  seasonalIndex: 0,
  horizonMonths: 6,
};

describe('validatePriceForecastInput', () => {
  it('reports every problem instead of stopping at the first', () => {
    const errors = validatePriceForecastInput({
      currentPrice: 0,
      supplyGrowthPercent: Number.NaN,
      demandGrowthPercent: 4,
      horizonMonths: 5,
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'currentPrice must be greater than zero',
        'supplyGrowthPercent must be a finite number',
        'horizonMonths must be one of 3, 6, 9, 12',
      ])
    );
    expect(errors).toHaveLength(3);
  });

  it('accepts the supported horizons and rejects everything else', () => {
    for (const horizonMonths of [3, 6, 9, 12]) {
      expect(validatePriceForecastInput({ ...baseInput, horizonMonths })).toEqual([]);
    }
    expect(validatePriceForecastInput({ ...baseInput, horizonMonths: 7 })).toContain(
      'horizonMonths must be one of 3, 6, 9, 12'
    );
  });

  it('validates optional history and equilibrium inputs', () => {
    expect(validatePriceForecastInput({ ...baseInput, recentMonthlyPrices: [40] })).toContain(
      'recentMonthlyPrices must contain at least two closes'
    );
    expect(validatePriceForecastInput({ ...baseInput, recentMonthlyPrices: [40, -1] })).toContain(
      'recentMonthlyPrices must all be greater than zero'
    );
    expect(validatePriceForecastInput({ ...baseInput, equilibriumPrice: 0 })).toContain(
      'equilibriumPrice must be greater than zero when supplied'
    );
  });
});

describe('forecastCarbonCreditPrice', () => {
  it('produces a bounded 3-12 month curve with uncertainty bands', () => {
    const forecast = forecastCarbonCreditPrice(baseInput, NOW);
    expect(forecast.points).toHaveLength(6);
    expect(forecast.methodologyVersion).toBe(FORECAST_MODEL_VERSION);
    expect(forecast.points.every((p) => p.lowerBound <= p.predictedPrice)).toBe(true);
    expect(forecast.points.every((p) => p.predictedPrice <= p.upperBound)).toBe(true);
  });

  it('labels each month relative to the anchor date', () => {
    const forecast = forecastCarbonCreditPrice({ ...baseInput, horizonMonths: 3 }, NOW);
    expect(forecast.points.map((point) => point.month)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(forecast.points.map((point) => point.horizonMonths)).toEqual([1, 2, 3]);
  });

  it('raises prices when demand growth outpaces supply growth', () => {
    const bullish = forecastCarbonCreditPrice(
      { ...baseInput, supplyGrowthPercent: 1, demandGrowthPercent: 12 },
      NOW
    );
    const bearish = forecastCarbonCreditPrice(
      { ...baseInput, supplyGrowthPercent: 12, demandGrowthPercent: 1 },
      NOW
    );
    expect(bullish.points[5].predictedPrice).toBeGreaterThan(baseInput.currentPrice);
    expect(bearish.points[5].predictedPrice).toBeLessThan(baseInput.currentPrice);
  });

  it('mean-reverts toward a supplied equilibrium', () => {
    const forecast = forecastCarbonCreditPrice(
      { ...baseInput, currentPrice: 100, equilibriumPrice: 50 },
      NOW
    );
    // Without reversion the curve would stay near 100; reversion must pull it down.
    expect(forecast.points[5].predictedPrice).toBeLessThan(100);
    expect(forecast.drivers.meanReversion).toBeLessThan(0);
  });

  it('widens the band when the realised volatility is higher', () => {
    const calm = forecastCarbonCreditPrice(
      { ...baseInput, recentMonthlyPrices: [40, 40.2, 40.1, 40.3, 40.2] },
      NOW
    );
    const wild = forecastCarbonCreditPrice(
      { ...baseInput, recentMonthlyPrices: [30, 45, 33, 52, 38] },
      NOW
    );
    const calmWidth = calm.points[5].upperBound - calm.points[5].lowerBound;
    const wildWidth = wild.points[5].upperBound - wild.points[5].lowerBound;
    expect(wildWidth).toBeGreaterThan(calmWidth);
    expect(wild.drivers.volatility).toBeGreaterThan(calm.drivers.volatility);
  });

  it('applies the month-of-year seasonal cycle', () => {
    const forecast = forecastCarbonCreditPrice(
      { currentPrice: 50, supplyGrowthPercent: 0, demandGrowthPercent: 0, horizonMonths: 12 },
      NOW
    );
    const prices = forecast.points.map((point) => point.predictedPrice);
    // A flat drift with seasonality must not produce a perfectly flat curve.
    expect(new Set(prices).size).toBeGreaterThan(1);
  });

  it('is deterministic for a fixed anchor date', () => {
    expect(forecastCarbonCreditPrice(baseInput, NOW)).toEqual(
      forecastCarbonCreditPrice(baseInput, NOW)
    );
  });

  it('throws with the joined validation messages', () => {
    expect(() => forecastCarbonCreditPrice({ ...baseInput, currentPrice: -1 }, NOW)).toThrow(
      /currentPrice must be greater than zero/
    );
  });
});

describe('estimateAnnualVolatility', () => {
  it('returns null when there is not enough history', () => {
    expect(estimateAnnualVolatility([40, 41])).toBeNull();
  });

  it('annualises monthly dispersion', () => {
    const volatility = estimateAnnualVolatility([40, 41, 39.5, 41.5, 40.5]);
    expect(volatility).toBeGreaterThan(0);
    expect(volatility).toBeLessThan(1);
  });
});

describe('backtestPriceForecast', () => {
  it('scores the overlap between the curve and realised closes', () => {
    const result = backtestPriceForecast({ ...baseInput, horizonMonths: 3 }, [41, 42, 43], NOW);
    expect(result.evaluatedMonths).toBe(3);
    expect(result.points).toHaveLength(3);
    expect(result.mape).toBeGreaterThanOrEqual(0);
    expect(result.rmse).toBeGreaterThanOrEqual(0);
    expect(result.bandHitRate).toBeGreaterThanOrEqual(0);
    expect(result.bandHitRate).toBeLessThanOrEqual(1);
  });

  it('scores a perfect in-band replay as a high hit rate', () => {
    const forecast = forecastCarbonCreditPrice({ ...baseInput, horizonMonths: 3 }, NOW);
    const actuals = forecast.points.map((point) => point.predictedPrice);
    const result = backtestPriceForecast({ ...baseInput, horizonMonths: 3 }, actuals, NOW);
    expect(result.bandHitRate).toBe(1);
    expect(result.mape).toBeLessThan(0.01);
  });

  it('rejects an empty actuals series', () => {
    expect(() => backtestPriceForecast(baseInput, [], NOW)).toThrow(
      'actualMonthlyPrices must contain at least one close'
    );
  });
});

describe('MODEL', () => {
  it('keeps the band multiplier positive so lowerBound never exceeds upperBound', () => {
    expect(MODEL.bandZ).toBeGreaterThan(0);
    expect(MODEL.maxVolatility).toBeGreaterThan(MODEL.minVolatility);
  });
});
