import type {
  PriceForecast,
  PriceForecastInput,
  PriceForecastPoint,
} from '@/lib/types/price-forecast';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function forecastCarbonCreditPrice(input: PriceForecastInput): PriceForecast {
  const horizon = Math.round(input.horizonMonths ?? 12);
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0)
    throw new Error('currentPrice must be greater than zero');
  if (!Number.isInteger(horizon) || horizon < 3 || horizon > 12)
    throw new Error('horizonMonths must be between 3 and 12');
  for (const [name, value] of Object.entries(input))
    if (name !== 'horizonMonths' && !Number.isFinite(value as number))
      throw new Error(`${name} must be numeric`);
  const supplyDemand = clamp(
    (input.demandGrowthPercent - input.supplyGrowthPercent) / 100,
    -0.5,
    0.5
  );
  const policy = clamp(input.policyMomentum ?? 0, -1, 1) * 0.08;
  const seasonality = clamp(input.seasonalIndex ?? 0, -1, 1) * 0.04;
  const monthlyDrift = (supplyDemand * 0.18 + policy + seasonality) / 12;
  const points: PriceForecastPoint[] = [];
  const base = new Date();
  for (let month = 1; month <= horizon; month++) {
    const date = new Date(base.getFullYear(), base.getMonth() + month, 1);
    const predicted = input.currentPrice * Math.exp(monthlyDrift * month);
    const uncertainty = 0.035 + month * 0.007;
    points.push({
      month: date.toISOString().slice(0, 7),
      horizonMonths: month,
      predictedPrice: round(predicted),
      lowerBound: round(predicted * (1 - uncertainty)),
      upperBound: round(predicted * (1 + uncertainty)),
      confidence: round(clamp(0.92 - month * 0.035, 0.5, 0.92), 2),
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026.1',
    input: { ...input, horizonMonths: horizon },
    points,
    drivers: {
      supplyDemand: round(supplyDemand, 4),
      policy: round(policy, 4),
      seasonality: round(seasonality, 4),
    },
  };
}
