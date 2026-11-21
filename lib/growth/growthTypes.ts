export interface SpeciesGrowthParams {
  slug: string;
  commonName: string;
  biome: string;
  /** FAO Tier-1 average CO2 sequestered per year once the tree is mature (kg). */
  co2KgPerYearAtMaturity: number;
  maturityYears: number;
}

export interface GrowthCurvePoint {
  /** Years since planting. */
  year: number;
  /** Projected annual CO2 sequestration rate at this age (kg/year). */
  annualCo2RateKg: number;
  /** Running total CO2 sequestered from planting through this year (kg). */
  cumulativeCo2Kg: number;
  /** annualCo2RateKg as a fraction of the species' mature-tree rate (0-1). */
  fractionOfMaturity: number;
}

export interface ClimateSuitability {
  /** How close regional annual rainfall is to the species' biome-optimal range (0-1). */
  rainfallScore: number;
  /** How close regional annual temperature is to the species' biome-optimal range (0-1). */
  temperatureScore: number;
  /** Combined suitability score (0-1). */
  overallScore: number;
  /** Multiplier applied to the mature-tree CO2 rate; range [0.6, 1.2]. */
  climateFactor: number;
}

export interface GrowthProjection {
  species: SpeciesGrowthParams;
  /** null when no climate data was available/configured — curve uses a neutral 1.0 factor. */
  climate: ClimateSuitability | null;
  climateSource: string | null;
  horizonYears: number;
  curve: GrowthCurvePoint[];
}
