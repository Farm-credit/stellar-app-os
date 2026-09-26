export interface PriceForecastInput {
  currentPrice: number;
  supplyGrowthPercent: number;
  demandGrowthPercent: number;
  policyMomentum?: number;
  seasonalIndex?: number;
  horizonMonths?: number;
}

export interface PriceForecastPoint {
  month: string;
  horizonMonths: number;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface PriceForecast {
  generatedAt: string;
  methodologyVersion: string;
  input: PriceForecastInput;
  points: PriceForecastPoint[];
  drivers: { supplyDemand: number; policy: number; seasonality: number };
}
