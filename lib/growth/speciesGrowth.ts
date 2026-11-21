import type { ClimateNormals } from '@/lib/climate/climateTypes';
import type {
  ClimateSuitability,
  GrowthCurvePoint,
  GrowthProjection,
  SpeciesGrowthParams,
} from './growthTypes';

// ── Growth curve model ───────────────────────────────────────────────────────
//
// Annual CO2 sequestration rate is modelled with a Chapman-Richards curve —
// a standard sigmoidal growth function used in forestry biomass modelling —
// bounded by the species' FAO Tier-1 mature-tree rate:
//
//   rate(t) = co2AtMaturity * climateFactor * (1 - e^(-k*t))^p
//
// `k` is solved so the curve reaches `MATURITY_FRACTION` of its ceiling at
// `maturityYears`. Cumulative sequestration is the trapezoidal-rule integral
// of the annual rate curve.

const SHAPE_PARAM = 2;
const MATURITY_FRACTION = 0.95;

/** Minimum/maximum multiplier applied to the mature-tree CO2 rate for climate suitability. */
const MIN_CLIMATE_FACTOR = 0.6;
const MAX_CLIMATE_FACTOR = 1.2;

interface ClimateEnvelope {
  rainfallMinMm: number;
  rainfallMaxMm: number;
  temperatureMinC: number;
  temperatureMaxC: number;
}

/**
 * Generalized FAO ecological-zone climate envelopes per biome, used only to
 * score regional suitability — not authoritative per-species data. Sourced
 * from typical FAO/Köppen-Geiger ecological zone rainfall/temperature
 * ranges for the biome labels present in data/fao_co2_rates.csv.
 */
const BIOME_CLIMATE_ENVELOPES: Record<string, ClimateEnvelope> = {
  'Tropical moist forest': {
    rainfallMinMm: 2000,
    rainfallMaxMm: 4000,
    temperatureMinC: 24,
    temperatureMaxC: 28,
  },
  'Tropical dry forest': {
    rainfallMinMm: 1000,
    rainfallMaxMm: 1500,
    temperatureMinC: 24,
    temperatureMaxC: 30,
  },
  'Tropical savanna': {
    rainfallMinMm: 500,
    rainfallMaxMm: 1200,
    temperatureMinC: 22,
    temperatureMaxC: 32,
  },
  Mangrove: {
    rainfallMinMm: 1500,
    rainfallMaxMm: 3000,
    temperatureMinC: 24,
    temperatureMaxC: 30,
  },
  'Mediterranean shrubland': {
    rainfallMinMm: 400,
    rainfallMaxMm: 900,
    temperatureMinC: 15,
    temperatureMaxC: 22,
  },
  'Subtropical forest': {
    rainfallMinMm: 1000,
    rainfallMaxMm: 2000,
    temperatureMinC: 15,
    temperatureMaxC: 22,
  },
  'Subtropical highland': {
    rainfallMinMm: 800,
    rainfallMaxMm: 1800,
    temperatureMinC: 12,
    temperatureMaxC: 20,
  },
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 1.0 inside [min, max]; falls off linearly to 0 over a 30%-of-range margin outside it. */
function scoreWithinRange(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1;
  const margin = (max - min) * 0.3 || 1;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / margin);
}

export function getBiomeClimateEnvelope(biome: string): ClimateEnvelope | undefined {
  return BIOME_CLIMATE_ENVELOPES[biome];
}

/**
 * Scores how well a region's long-term rainfall/temperature normals suit a
 * species' biome. Returns null when the biome has no known climate envelope
 * (the caller should treat the growth curve as climate-neutral in that case).
 */
export function scoreClimateSuitability(
  biome: string,
  normals: ClimateNormals
): ClimateSuitability | null {
  const envelope = getBiomeClimateEnvelope(biome);
  if (!envelope) return null;

  const rainfallScore = scoreWithinRange(
    normals.avgAnnualRainfallMm,
    envelope.rainfallMinMm,
    envelope.rainfallMaxMm
  );
  const temperatureScore = scoreWithinRange(
    normals.avgAnnualTemperatureC,
    envelope.temperatureMinC,
    envelope.temperatureMaxC
  );
  const overallScore = Math.sqrt(rainfallScore * temperatureScore);
  const climateFactor =
    MIN_CLIMATE_FACTOR + (MAX_CLIMATE_FACTOR - MIN_CLIMATE_FACTOR) * overallScore;

  return {
    rainfallScore: round(rainfallScore, 4),
    temperatureScore: round(temperatureScore, 4),
    overallScore: round(overallScore, 4),
    climateFactor: round(climateFactor, 4),
  };
}

function chapmanRichardsK(maturityYears: number): number {
  return -Math.log(1 - MATURITY_FRACTION ** (1 / SHAPE_PARAM)) / maturityYears;
}

function annualRateAt(year: number, ceilingKg: number, k: number): number {
  return ceilingKg * (1 - Math.exp(-k * year)) ** SHAPE_PARAM;
}

function buildCurve(
  ceilingKg: number,
  maturityYears: number,
  horizonYears: number
): GrowthCurvePoint[] {
  const k = chapmanRichardsK(maturityYears);
  const points: GrowthCurvePoint[] = [];
  let cumulative = 0;
  let previousRate = 0;

  for (let year = 0; year <= horizonYears; year++) {
    const annualRate = annualRateAt(year, ceilingKg, k);
    if (year > 0) {
      cumulative += (previousRate + annualRate) / 2;
    }
    points.push({
      year,
      annualCo2RateKg: round(annualRate, 2),
      cumulativeCo2Kg: round(cumulative, 2),
      fractionOfMaturity: round(ceilingKg > 0 ? annualRate / ceilingKg : 0, 4),
    });
    previousRate = annualRate;
  }

  return points;
}

/**
 * Computes a species' expected CO2/biomass growth curve from planting through
 * `horizonYears` (default: the species' maturity_years), optionally adjusted
 * for regional climate suitability.
 */
export function calculateGrowthProjection(
  species: SpeciesGrowthParams,
  climateNormals: ClimateNormals | null,
  horizonYears?: number
): GrowthProjection {
  const horizon =
    horizonYears && Number.isInteger(horizonYears) && horizonYears > 0
      ? horizonYears
      : species.maturityYears;

  const climate = climateNormals ? scoreClimateSuitability(species.biome, climateNormals) : null;
  const climateFactor = climate?.climateFactor ?? 1;
  const ceilingKg = species.co2KgPerYearAtMaturity * climateFactor;

  return {
    species,
    climate,
    climateSource: climateNormals?.source ?? null,
    horizonYears: horizon,
    curve: buildCurve(ceilingKg, species.maturityYears, horizon),
  };
}
