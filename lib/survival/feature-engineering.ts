/**
 * Feature engineering for the tree survival prediction model (#1156).
 *
 * Each feature is independently normalised to [0, 1] so all contribute
 * proportionally to the final weighted ensemble. Boundary values and
 * scoring curves are derived from FAO forestry literature and the
 * platform's existing biome climate envelope data.
 */

import type {
  HistoricalPlantingRecord,
  PlantingSiteClimate,
  SoilCharacteristics,
  SoilTexture,
} from '@/lib/types/survival-model';

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function linearScore(value: number, lo: number, hi: number): number {
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/** Score peaks at `peak`, falls off symmetrically with `margin` either side. */
function peakScore(value: number, peak: number, margin: number): number {
  const dist = Math.abs(value - peak);
  return Math.max(0, 1 - dist / margin);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ── 1. Historical survival rate ───────────────────────────────────────────────

/**
 * Aggregates historical planting records for a specific species × region.
 * Returns the weighted empirical survival rate (recent batches weighted more).
 * Falls back to a conservative prior of 0.65 when no records exist.
 */
export function computeHistoricalSurvivalRate(
  records: HistoricalPlantingRecord[],
  speciesSlug: string,
  regionKey: string
): number {
  const PRIOR = 0.65; // conservative prior when no data available

  const matching = records.filter(
    (r) => r.speciesSlug === speciesSlug && r.regionKey === regionKey
  );

  if (matching.length === 0) {
    // Fall back to species-only records (across all regions)
    const speciesOnly = records.filter((r) => r.speciesSlug === speciesSlug);
    if (speciesOnly.length === 0) return PRIOR;

    const totalPlanted = speciesOnly.reduce((a, r) => a + r.treesPlanted, 0);
    const totalSurvived = speciesOnly.reduce((a, r) => a + r.treesSurvived, 0);
    return totalPlanted > 0 ? totalSurvived / totalPlanted : PRIOR;
  }

  // Time-decay weighted average: more recent records get higher weight.
  const now = Date.now();
  let weightedSurvived = 0;
  let weightedPlanted = 0;

  for (const record of matching) {
    const ageYears = (now - new Date(record.plantedAt).getTime()) / (365.25 * 86400 * 1000);
    // Exponential decay: half-life ~3 years
    const weight = Math.exp(-ageYears * Math.log(2) / 3);
    weightedSurvived += record.treesSurvived * weight;
    weightedPlanted += record.treesPlanted * weight;
  }

  return weightedPlanted > 0 ? clamp(weightedSurvived / weightedPlanted, 0, 1) : PRIOR;
}

// ── 2. Climate suitability ────────────────────────────────────────────────────

/**
 * Biome → optimal rainfall and temperature ranges.
 * Mirrors the envelopes in lib/growth/speciesGrowth.ts for consistency.
 */
const BIOME_ENVELOPES: Record<
  string,
  { rainfallMin: number; rainfallMax: number; tempMin: number; tempMax: number; drySeasonMax: number }
> = {
  'Tropical moist forest':    { rainfallMin: 2000, rainfallMax: 4000, tempMin: 24, tempMax: 28, drySeasonMax: 3 },
  'Tropical dry forest':      { rainfallMin: 1000, rainfallMax: 1500, tempMin: 24, tempMax: 30, drySeasonMax: 6 },
  'Tropical savanna':         { rainfallMin: 500,  rainfallMax: 1200, tempMin: 22, tempMax: 32, drySeasonMax: 8 },
  'Mangrove':                 { rainfallMin: 1500, rainfallMax: 3000, tempMin: 24, tempMax: 30, drySeasonMax: 2 },
  'Mediterranean shrubland':  { rainfallMin: 400,  rainfallMax: 900,  tempMin: 15, tempMax: 22, drySeasonMax: 5 },
  'Subtropical forest':       { rainfallMin: 1000, rainfallMax: 2000, tempMin: 15, tempMax: 22, drySeasonMax: 4 },
  'Subtropical highland':     { rainfallMin: 800,  rainfallMax: 1800, tempMin: 12, tempMax: 20, drySeasonMax: 4 },
};

/** Fallback envelope when biome is not recognised */
const DEFAULT_ENVELOPE = { rainfallMin: 600, rainfallMax: 3000, tempMin: 10, tempMax: 35, drySeasonMax: 7 };

export function computeClimateSuitability(
  biome: string,
  climate: PlantingSiteClimate
): number {
  const env = BIOME_ENVELOPES[biome] ?? DEFAULT_ENVELOPE;

  // Rainfall: full score inside [min, max], penalised outside
  const rainfallScore = (() => {
    if (climate.annualRainfallMm >= env.rainfallMin && climate.annualRainfallMm <= env.rainfallMax) return 1;
    const margin = (env.rainfallMax - env.rainfallMin) * 0.4 || 200;
    const dist = climate.annualRainfallMm < env.rainfallMin
      ? env.rainfallMin - climate.annualRainfallMm
      : climate.annualRainfallMm - env.rainfallMax;
    return Math.max(0, 1 - dist / margin);
  })();

  // Temperature: peaks at midpoint of the range
  const tempMid = (env.tempMin + env.tempMax) / 2;
  const tempMargin = (env.tempMax - env.tempMin) * 0.6 || 5;
  const temperatureScore = peakScore(climate.meanTemperatureC, tempMid, tempMargin);

  // Dry season length: longer dry seasons are penalising
  const drySeasonScore = Math.max(0, 1 - Math.max(0, climate.drySeasonMonths - env.drySeasonMax) / 4);

  // Combined: geometric mean of the three signals
  return round4(Math.cbrt(rainfallScore * temperatureScore * drySeasonScore));
}

// ── 3. Soil quality ───────────────────────────────────────────────────────────

/** Water holding capacity scores per texture class */
const TEXTURE_WHC_SCORE: Record<SoilTexture, number> = {
  'silty-clay':  0.85,
  'clay-loam':   0.9,
  'loam':        1.0,   // optimal
  'silt-loam':   0.95,
  'clay':        0.7,   // drainage issues
  'sandy-loam':  0.75,
  'loamy-sand':  0.55,
  'sand':        0.3,   // poor retention
};

export function computeSoilQuality(soil: SoilCharacteristics): number {
  // pH: optimal 5.5–7.0 for most tropical/subtropical species
  const phScore = peakScore(soil.ph, 6.25, 1.5);

  // Organic matter: more is better up to ~8 %
  const omScore = linearScore(soil.organicMatterPercent, 0.5, 8);

  // Water holding capacity: higher is better (200–400 mm/m is ideal)
  const whcScore = linearScore(soil.waterHoldingCapacityMm, 50, 400);

  // Texture base score
  const textureScore = TEXTURE_WHC_SCORE[soil.texture] ?? 0.6;

  // Weighted combination
  return round4(0.25 * phScore + 0.30 * omScore + 0.25 * whcScore + 0.20 * textureScore);
}

// ── 4. Planting season ────────────────────────────────────────────────────────

/**
 * Scores when in the year a tree was planted.
 * Planting at the start of the wet season (month 4–6 in tropics) maximises
 * establishment. We use a cosine approximation centred on month 5 (May)
 * as the global wet-season onset proxy.
 */
export function computePlantingSeasonScore(plantingDateIso: string): number {
  const date = new Date(plantingDateIso);
  if (isNaN(date.getTime())) return 0.5; // neutral if date is invalid

  const month = date.getMonth() + 1; // 1–12
  // Cosine curve: peaks at month 5, nadir at month 11
  const angle = ((month - 5) / 12) * 2 * Math.PI;
  return round4((Math.cos(angle) + 1) / 2);
}

// ── 5. Biome–species match ────────────────────────────────────────────────────

/**
 * Per-species known-good biome lookup.
 * This encodes expert knowledge about which FAO biomes each common species
 * is native or well-adapted to. Expand as the species catalogue grows.
 */
const SPECIES_NATIVE_BIOMES: Record<string, string[]> = {
  teak:          ['Tropical moist forest', 'Tropical dry forest'],
  moringa:       ['Tropical savanna', 'Tropical dry forest'],
  eucalyptus:    ['Subtropical forest', 'Tropical savanna'],
  mangrove:      ['Mangrove'],
  mahogany:      ['Tropical moist forest'],
  acacia:        ['Tropical savanna', 'Tropical dry forest'],
  bamboo:        ['Tropical moist forest', 'Subtropical forest', 'Subtropical highland'],
  cedar:         ['Subtropical highland', 'Mediterranean shrubland'],
  casuarina:     ['Tropical savanna', 'Tropical dry forest'],
  neem:          ['Tropical dry forest', 'Tropical savanna'],
};

export function computeBiomeMatchScore(speciesSlug: string, biome: string): number {
  const nativeBiomes = SPECIES_NATIVE_BIOMES[speciesSlug.toLowerCase()];
  if (!nativeBiomes) return 0.6; // unknown species — moderate neutral score

  if (nativeBiomes.includes(biome)) return 1.0;

  // Partial credit: related biomes (e.g. tropical moist ↔ tropical dry)
  const related: Record<string, string[]> = {
    'Tropical moist forest': ['Tropical dry forest', 'Subtropical forest'],
    'Tropical dry forest':   ['Tropical moist forest', 'Tropical savanna'],
    'Tropical savanna':      ['Tropical dry forest'],
    'Subtropical forest':    ['Subtropical highland', 'Tropical moist forest'],
    'Subtropical highland':  ['Subtropical forest', 'Mediterranean shrubland'],
    'Mediterranean shrubland': ['Subtropical highland'],
    'Mangrove':              [],
  };

  const relatedBiomes = related[biome] ?? [];
  if (nativeBiomes.some((b) => relatedBiomes.includes(b))) return 0.5;

  return 0.2; // species in a clearly unsuitable biome
}
