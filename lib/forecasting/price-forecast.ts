import type {
  PriceForecast,
  PriceForecastRequest,
  PriceForecastPoint,
} from '@/lib/types/issue-1374-1377';
export const FORECAST_MODEL_VERSION = 'carbon-price-v1';
export function validateForecastRequest(input: Partial<PriceForecastRequest>): string | null {
  if (!input.projectId?.trim()) return 'projectId is required';
  if (!Number.isFinite(input.currentPrice) || (input.currentPrice ?? 0) <= 0)
    return 'currentPrice must be greater than zero';
  if (![3, 6, 9, 12].includes(input.horizonMonths ?? 0))
    return 'horizonMonths must be 3, 6, 9, or 12';
  for (const [key, value] of Object.entries({
    supplyGrowthPct: input.supplyGrowthPct,
    demandGrowthPct: input.demandGrowthPct,
    policyIndex: input.policyIndex,
    seasonalIndex: input.seasonalIndex,
  }))
    if (!Number.isFinite(value)) return `${key} must be a finite number`;
  return null;
}
export function buildPriceForecast(input: PriceForecastRequest, now = new Date()): PriceForecast {
  const error = validateForecastRequest(input);
  if (error) throw new Error(error);
  const points: PriceForecastPoint[] = [];
  const netPressure =
    ((input.demandGrowthPct - input.supplyGrowthPct) / 100) * 0.65 +
    input.policyIndex * 0.02 +
    input.seasonalIndex * 0.01;
  for (let month = 1; month <= input.horizonMonths; month++) {
    const predictedPrice = Number(
      (input.currentPrice * Math.exp((netPressure * month) / 12)).toFixed(2)
    );
    const uncertainty = Math.min(0.35, 0.08 + month * 0.012);
    points.push({
      month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + month, 1))
        .toISOString()
        .slice(0, 7),
      predictedPrice,
      lowerBound: Number((predictedPrice * (1 - uncertainty)).toFixed(2)),
      upperBound: Number((predictedPrice * (1 + uncertainty)).toFixed(2)),
    });
  }
  return {
    ...input,
    generatedAt: now.toISOString(),
    modelVersion: FORECAST_MODEL_VERSION,
    confidence: Number(Math.max(0.45, 0.9 - input.horizonMonths * 0.025).toFixed(2)),
    points,
  };
}
