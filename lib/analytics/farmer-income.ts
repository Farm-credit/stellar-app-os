import type { Pool } from 'pg';

export interface FarmerIncomePredictionInput {
  landSize?: number;
  region?: string;
  practiceType?: string;
  [key: string]: unknown;
}

export interface FarmerIncomePrediction {
  estimatedAnnualIncome: number;
  currency: string;
  generatedAt: string;
}

export function parseFarmerIncomePredictionInput(input: unknown): FarmerIncomePredictionInput {
  return input as FarmerIncomePredictionInput;
}

export function getFarmerIncomePrediction(
  _pool: Pick<Pool, 'query'>,
  _input: FarmerIncomePredictionInput
): Promise<FarmerIncomePrediction> {
  return Promise.resolve({
    estimatedAnnualIncome: 0,
    currency: 'USD',
    generatedAt: new Date().toISOString(),
  });
}
