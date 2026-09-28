/**
 * Farmer income prediction (v2) — Issue #1421
 *
 * Projects what a farmer could earn from a carbon project given their land
 * size, location (region), farming practice and historical carbon prices.
 *
 * The model is deliberately simple and fully deterministic so the numbers can
 * be explained to a farmer line by line:
 *
 *   gross tCO₂e/yr = hectares × practice rate × regional factor × ramp-up
 *   net credits    = gross × (1 − buffer pool share)
 *   farmer income  = net credits × price per tonne × farmer revenue share
 *
 * Prices come from the same catalog as `/api/v2/historical-carbon-data`, so a
 * prediction always agrees with the price history the rest of the app shows.
 * Low/expected/high scenarios use the lowest monthly average, the trailing
 * 12-month average and the highest monthly average over the last two years.
 * Prices are held flat across the projection — no speculative growth.
 */

import { CARBON_REGIONS, type CarbonProjectType, type CarbonRegion } from '@/lib/api/carbon-prices';
import {
  getHistoricalCarbonData,
  type HistoricalMarketPoint,
} from '@/lib/api/historical-carbon-data';

// ── Model constants ───────────────────────────────────────────────────────────

export const FARMING_PRACTICES = [
  'agroforestry',
  'reforestation',
  'mangrove-restoration',
  'cover-cropping',
  'no-till',
  'rotational-grazing',
] as const;

export type FarmingPractice = (typeof FARMING_PRACTICES)[number];

interface PracticeProfile {
  label: string;
  /** Conservative mid-range sequestration once fully established. */
  tco2ePerHectareYear: number;
  /** Years until the practice reaches its full rate (linear ramp). */
  rampUpYears: number;
  /** Price series used to value the credits. */
  projectType: CarbonProjectType;
}

export const PRACTICE_PROFILES: Record<FarmingPractice, PracticeProfile> = {
  agroforestry: {
    label: 'Agroforestry',
    tco2ePerHectareYear: 5,
    rampUpYears: 3,
    projectType: 'Reforestation',
  },
  reforestation: {
    label: 'Reforestation',
    tco2ePerHectareYear: 8,
    rampUpYears: 4,
    projectType: 'Reforestation',
  },
  'mangrove-restoration': {
    label: 'Mangrove restoration',
    tco2ePerHectareYear: 10,
    rampUpYears: 3,
    projectType: 'Mangrove Restoration',
  },
  'cover-cropping': {
    label: 'Cover cropping',
    tco2ePerHectareYear: 1,
    rampUpYears: 1,
    projectType: 'Sustainable Agriculture',
  },
  'no-till': {
    label: 'No-till',
    tco2ePerHectareYear: 0.5,
    rampUpYears: 1,
    projectType: 'Sustainable Agriculture',
  },
  'rotational-grazing': {
    label: 'Rotational grazing',
    tco2ePerHectareYear: 1.2,
    rampUpYears: 2,
    projectType: 'Sustainable Agriculture',
  },
};

/** Growing-conditions multiplier applied to the practice rate. */
export const REGION_FACTORS: Record<CarbonRegion, number> = {
  africa: 1.1,
  'latin-america': 1.1,
  'southeast-asia': 1.15,
  oceania: 0.9,
  'north-america': 0.85,
  global: 1,
};

/** Share of issued credits held back in the non-permanence buffer pool. */
export const BUFFER_POOL_SHARE = 0.2;
/** Share of sale proceeds paid to the farmer after verification and fees. */
export const FARMER_REVENUE_SHARE = 0.8;

export const MAX_LAND_SIZE_HECTARES = 100_000;
export const DEFAULT_PROJECT_YEARS = 10;
export const MAX_PROJECT_YEARS = 30;
/** Months of price history the scenarios are drawn from. */
export const PRICE_HISTORY_MONTHS = 24;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IncomePredictionInput {
  landSizeHectares: number;
  region: CarbonRegion;
  practiceType: FarmingPractice;
  projectYears: number;
}

export type IncomePredictionParseResult =
  { ok: true; data: IncomePredictionInput } | { ok: false; errors: string[] };

export interface IncomeScenarios {
  low: number;
  expected: number;
  high: number;
}

export interface YearlyIncomeProjection {
  year: number;
  /** Net credits after the buffer pool, in tCO₂e. */
  creditsTonnes: number;
  income: IncomeScenarios;
}

/** Which slice of the price catalog the scenarios were drawn from. */
export type PriceBasis = 'region-and-practice' | 'practice' | 'region' | 'market';

export interface IncomePrediction {
  generatedAt: string;
  input: IncomePredictionInput;
  practice: { label: string; projectType: CarbonProjectType };
  sequestration: {
    tco2ePerHectareYear: number;
    regionFactor: number;
    /** Net credits per year once the practice is fully established. */
    annualCreditsAtMaturity: number;
    rampUpYears: number;
  };
  prices: IncomeScenarios & {
    currency: 'USD';
    basis: PriceBasis;
    months: number;
  };
  yearly: YearlyIncomeProjection[];
  totals: {
    creditsTonnes: number;
    income: IncomeScenarios;
    incomePerHectarePerYear: IncomeScenarios;
  };
  assumptions: {
    bufferPoolShare: number;
    farmerRevenueShare: number;
    priceGrowth: 'flat';
  };
  disclaimer: string;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function canonical<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return allowed.find((item) => item.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized);
}

function readNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Validate a prediction request from JSON or query-string values. */
export function parseIncomePredictionInput(raw: unknown): IncomePredictionParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Request body must be a JSON object'] };
  }
  const body = raw as Record<string, unknown>;
  const errors: string[] = [];

  const landSizeHectares = readNumber(body.landSizeHectares);
  if (landSizeHectares === undefined) {
    errors.push('landSizeHectares is required');
  } else if (
    Number.isNaN(landSizeHectares) ||
    landSizeHectares <= 0 ||
    landSizeHectares > MAX_LAND_SIZE_HECTARES
  ) {
    errors.push(`landSizeHectares must be a number between 0 and ${MAX_LAND_SIZE_HECTARES}`);
  }

  const region =
    typeof body.region === 'string' ? canonical(body.region, CARBON_REGIONS) : undefined;
  if (!body.region) {
    errors.push('region is required');
  } else if (!region) {
    errors.push(`region must be one of: ${CARBON_REGIONS.join(', ')}`);
  }

  const practiceType =
    typeof body.practiceType === 'string'
      ? canonical(body.practiceType, FARMING_PRACTICES)
      : undefined;
  if (!body.practiceType) {
    errors.push('practiceType is required');
  } else if (!practiceType) {
    errors.push(`practiceType must be one of: ${FARMING_PRACTICES.join(', ')}`);
  }

  const years = readNumber(body.projectYears);
  if (years !== undefined && (!Number.isInteger(years) || years < 1 || years > MAX_PROJECT_YEARS)) {
    errors.push(`projectYears must be a whole number between 1 and ${MAX_PROJECT_YEARS}`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      landSizeHectares: landSizeHectares as number,
      region: region as CarbonRegion,
      practiceType: practiceType as FarmingPractice,
      projectYears: years ?? DEFAULT_PROJECT_YEARS,
    },
  };
}

/** Same as {@link parseIncomePredictionInput}, for `GET` query strings. */
export function parseIncomePredictionQuery(params: URLSearchParams): IncomePredictionParseResult {
  return parseIncomePredictionInput(Object.fromEntries(params.entries()));
}

// ── Prediction ────────────────────────────────────────────────────────────────

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function scale(scenarios: IncomeScenarios, factor: number): IncomeScenarios {
  return {
    low: round(scenarios.low * factor),
    expected: round(scenarios.expected * factor),
    high: round(scenarios.high * factor),
  };
}

function monthlyHistory(
  now: Date,
  filters: { regions?: CarbonRegion[]; projectTypes?: CarbonProjectType[] }
): HistoricalMarketPoint[] {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - (PRICE_HISTORY_MONTHS * 30 - 1) * 86_400_000);
  return getHistoricalCarbonData(
    {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      interval: 'month',
      ...filters,
    },
    now
  ).priceHistory.filter((point) => point.averagePricePerTon > 0);
}

/**
 * Price scenarios for a practice in a region, widening the catalog slice when
 * there is no series for the exact combination.
 */
export function getPriceScenarios(
  region: CarbonRegion,
  projectType: CarbonProjectType,
  now: Date = new Date()
): IncomeScenarios & { basis: PriceBasis; months: number } {
  const attempts: Array<[PriceBasis, Parameters<typeof monthlyHistory>[1]]> = [
    ['region-and-practice', { regions: [region], projectTypes: [projectType] }],
    ['practice', { projectTypes: [projectType] }],
    ['region', { regions: [region] }],
    ['market', {}],
  ];

  for (const [basis, filters] of attempts) {
    const history = monthlyHistory(now, filters);
    if (!history.length) continue;

    const prices = history.map((point) => point.averagePricePerTon);
    const trailing = prices.slice(-12);
    return {
      low: round(Math.min(...prices)),
      expected: round(trailing.reduce((sum, price) => sum + price, 0) / trailing.length),
      high: round(Math.max(...prices)),
      basis,
      months: history.length,
    };
  }

  throw new Error('No carbon price history is available');
}

/** Fraction of the full sequestration rate reached in `year` (1-based). */
export function rampUpFactor(year: number, rampUpYears: number): number {
  if (rampUpYears <= 1) return 1;
  return Math.min(1, year / rampUpYears);
}

/** Project a farmer's carbon income for the requested land and practice. */
export function predictFarmerIncome(
  input: IncomePredictionInput,
  now: Date = new Date()
): IncomePrediction {
  const profile = PRACTICE_PROFILES[input.practiceType];
  const regionFactor = REGION_FACTORS[input.region];
  const prices = getPriceScenarios(input.region, profile.projectType, now);

  const annualCreditsAtMaturity =
    input.landSizeHectares * profile.tco2ePerHectareYear * regionFactor * (1 - BUFFER_POOL_SHARE);
  const farmerPrices: IncomeScenarios = {
    low: prices.low * FARMER_REVENUE_SHARE,
    expected: prices.expected * FARMER_REVENUE_SHARE,
    high: prices.high * FARMER_REVENUE_SHARE,
  };

  const yearly: YearlyIncomeProjection[] = [];
  let totalCredits = 0;
  for (let year = 1; year <= input.projectYears; year += 1) {
    const credits = annualCreditsAtMaturity * rampUpFactor(year, profile.rampUpYears);
    totalCredits += credits;
    yearly.push({
      year,
      creditsTonnes: round(credits),
      income: scale(farmerPrices, credits),
    });
  }

  const totalIncome = scale(farmerPrices, totalCredits);
  const hectareYears = input.landSizeHectares * input.projectYears;

  return {
    generatedAt: now.toISOString(),
    input,
    practice: { label: profile.label, projectType: profile.projectType },
    sequestration: {
      tco2ePerHectareYear: profile.tco2ePerHectareYear,
      regionFactor,
      annualCreditsAtMaturity: round(annualCreditsAtMaturity),
      rampUpYears: profile.rampUpYears,
    },
    prices: {
      low: prices.low,
      expected: prices.expected,
      high: prices.high,
      currency: 'USD',
      basis: prices.basis,
      months: prices.months,
    },
    yearly,
    totals: {
      creditsTonnes: round(totalCredits),
      income: totalIncome,
      incomePerHectarePerYear: scale(totalIncome, 1 / hectareYears),
    },
    assumptions: {
      bufferPoolShare: BUFFER_POOL_SHARE,
      farmerRevenueShare: FARMER_REVENUE_SHARE,
      priceGrowth: 'flat',
    },
    disclaimer:
      'Estimate only. Actual credits depend on verified measurements, and actual income on the prices buyers pay at the time of sale.',
  };
}
