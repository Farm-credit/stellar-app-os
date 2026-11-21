export type CalculationMode = 'employees' | 'travel';

export const EMPLOYEE_EMISSIONS_TONNES = 2.9;
export const AIR_TRAVEL_EMISSIONS_KG_PER_PASSENGER_KM = 0.158;
export const RECOMMENDED_BUFFER = 1.1;
export const CREDIT_PRICE_USD = 18;

export interface CarbonOffsetEstimate {
  emissionsTonnes: number;
  credits: number;
  estimatedCostUsd: number;
}

export function calculateCarbonOffset(mode: CalculationMode, value: number): CarbonOffsetEstimate {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const emissionsTonnes =
    mode === 'employees'
      ? safeValue * EMPLOYEE_EMISSIONS_TONNES
      : (safeValue * AIR_TRAVEL_EMISSIONS_KG_PER_PASSENGER_KM) / 1000;
  const credits = Math.ceil(emissionsTonnes * RECOMMENDED_BUFFER);

  return {
    emissionsTonnes,
    credits,
    estimatedCostUsd: credits * CREDIT_PRICE_USD,
  };
}
