export interface PriceForecastInput {
  currentPrice: number;
  supplyGrowthPercent: number;
  demandGrowthPercent: number;
  policyMomentum?: number;
  seasonalIndex?: number;
  horizonMonths?: number;
  /**
   * Optional trailing monthly closes, oldest → newest. Used to estimate the
   * realised trend and volatility instead of relying purely on the supplied
   * growth assumptions.
   */
  recentMonthlyPrices?: number[];
  /**
   * Optional long-run equilibrium price. When supplied the curve mean-reverts
   * toward it instead of compounding the drift indefinitely.
   */
  equilibriumPrice?: number;
}

export interface PriceForecastPoint {
  month: string;
  horizonMonths: number;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface PriceForecastDrivers {
  supplyDemand: number;
  policy: number;
  seasonality: number;
  /** Annualised log drift applied to the base price (before mean reversion). */
  annualDrift: number;
  /** Annualised volatility (σ) used to widen the prediction band. */
  volatility: number;
  /** Strength of the pull toward `equilibriumPrice`; 0 when none was supplied. */
  meanReversion: number;
}

export interface PriceForecast {
  generatedAt: string;
  methodologyVersion: string;
  input: PriceForecastInput;
  points: PriceForecastPoint[];
  drivers: PriceForecastDrivers;
}

/** Per-horizon error metrics from replaying the model over historical closes. */
export interface PriceForecastBacktest {
  evaluatedMonths: number;
  /** Mean absolute percentage error, as a fraction (0.1 = 10%). */
  mape: number;
  /** Root mean squared error in price units. */
  rmse: number;
  /** Share of actuals that fell inside the predicted band (0–1). */
  bandHitRate: number;
  points: Array<{
    month: string;
    predictedPrice: number;
    actualPrice: number;
    insideBand: boolean;
  }>;
}
