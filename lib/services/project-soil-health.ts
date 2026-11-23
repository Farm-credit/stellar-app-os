/**
 * Project soil health reporting — Issue #1664
 *
 * Turns a project's raw soil readings into the shape the project page needs:
 * indicators ordered oldest → newest, one comparison row per indicator, and
 * radar-chart coordinates normalised to a published scale.
 *
 * Kept framework-free and pure so the API route, the chart and the tests share
 * exactly one definition of what "the change since baseline" means.
 */

export interface SoilHealthReading {
  /** ISO date (YYYY-MM-DD) of the field measurement. */
  date: string;
  /** Soil pH. */
  ph: number;
  /** Plant-available nitrogen, mg/kg. */
  nitrogenMgKg: number;
  /** Volumetric soil moisture, percent. */
  moisturePercent: number;
  /** Soil organic matter, percent by mass. */
  organicMatterPercent: number;
}

export interface ProjectSoilHealthData {
  /** Where the readings came from, shown verbatim in the UI. */
  source: string;
  /** True when readings are illustrative and must be labelled as such. */
  isSampleData: boolean;
  readings: SoilHealthReading[];
}

export type SoilIndicatorKey = Exclude<keyof SoilHealthReading, 'date'>;

export interface SoilIndicator {
  key: SoilIndicatorKey;
  label: string;
  unit: string;
  /** Upper bound of the published scale used for the radar chart axis. */
  chartMax: number;
  /** Decimal places used for display. */
  precision: number;
}

/**
 * The four indicators the project page reports, with the scale each is plotted
 * against. `chartMax` matches the ranges already documented in the UI: pH 0–14,
 * nitrogen 0–400 mg/kg, moisture 0–50%, organic matter 0–10%.
 */
export const SOIL_INDICATORS: readonly SoilIndicator[] = [
  { key: 'ph', label: 'pH', unit: '', chartMax: 14, precision: 1 },
  { key: 'nitrogenMgKg', label: 'Nitrogen', unit: 'mg/kg', chartMax: 400, precision: 0 },
  { key: 'moisturePercent', label: 'Moisture', unit: '%', chartMax: 50, precision: 0 },
  { key: 'organicMatterPercent', label: 'Organic matter', unit: '%', chartMax: 10, precision: 1 },
];

export type SoilChangeDirection = 'up' | 'down' | 'flat';

export interface SoilIndicatorComparison {
  key: SoilIndicatorKey;
  label: string;
  unit: string;
  /** Value at the earliest reading in the series. */
  baseline: number;
  /** Value at the most recent reading in the series. */
  latest: number;
  /** latest − baseline. */
  change: number;
  /** Percentage change against the baseline, or null when the baseline is 0. */
  changePercent: number | null;
  direction: SoilChangeDirection;
  /** Baseline plotted on the published scale, 0–100. */
  baselinePercentOfScale: number;
  /** Latest value plotted on the published scale, 0–100. */
  latestPercentOfScale: number;
}

export interface ProjectSoilHealthReport extends ProjectSoilHealthData {
  projectId: string;
  /** Readings ordered oldest → newest, one per measurement date. */
  readings: SoilHealthReading[];
  baselineDate: string | null;
  latestDate: string | null;
  /** True once there are at least two readings to compare. */
  hasHistory: boolean;
  comparison: SoilIndicatorComparison[];
  /** Indicators that moved up between the baseline and the latest reading. */
  improvedCount: number;
  /** Readings discarded because they were undated, unparseable or incomplete. */
  ignoredReadingCount: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A reading is usable only when its date parses and every indicator is a finite
 * number: a partially-measured row would otherwise plot as a zero and read as a
 * collapse in soil health.
 */
function isValidReading(reading: SoilHealthReading): boolean {
  if (typeof reading?.date !== 'string' || Number.isNaN(Date.parse(reading.date))) return false;
  return SOIL_INDICATORS.every((indicator) => isFiniteNumber(reading[indicator.key]));
}

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function formatChangePercent(baseline: number, change: number): number | null {
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return Math.round((change / Math.abs(baseline)) * 1000) / 10;
}

/**
 * Normalises a measurement series: chronological order, one reading per date
 * (the last one recorded for that date wins), invalid rows dropped.
 */
export function normalizeSoilReadings(readings: SoilHealthReading[]): {
  readings: SoilHealthReading[];
  ignoredReadingCount: number;
} {
  const usable = (readings ?? []).filter(isValidReading);
  const ignoredReadingCount = (readings ?? []).length - usable.length;

  const byDate = new Map<string, SoilHealthReading>();
  for (const reading of usable) {
    const day = reading.date.slice(0, 10);
    byDate.set(day, { ...reading, date: day });
  }

  const normalized = [...byDate.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { readings: normalized, ignoredReadingCount };
}

/**
 * Builds the comparison the project page renders. With a single reading there is
 * no history: the comparison compares the reading to itself and `hasHistory` is
 * false, so callers can hide the change column instead of showing "+0".
 */
export function buildProjectSoilHealthReport(
  projectId: string,
  data: ProjectSoilHealthData
): ProjectSoilHealthReport {
  const { readings, ignoredReadingCount } = normalizeSoilReadings(data.readings);
  const baseline = readings[0] ?? null;
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  const comparison = SOIL_INDICATORS.map((indicator) => {
    const baselineValue = baseline ? baseline[indicator.key] : 0;
    const latestValue = latest ? latest[indicator.key] : 0;
    const change = latestValue - baselineValue;

    return {
      key: indicator.key,
      label: indicator.label,
      unit: indicator.unit,
      baseline: baselineValue,
      latest: latestValue,
      change,
      changePercent: formatChangePercent(baselineValue, change),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      baselinePercentOfScale: clampPercent(baselineValue, indicator.chartMax),
      latestPercentOfScale: clampPercent(latestValue, indicator.chartMax),
    } satisfies SoilIndicatorComparison;
  });

  return {
    projectId,
    source: data.source,
    isSampleData: data.isSampleData,
    readings,
    baselineDate: baseline?.date ?? null,
    latestDate: latest?.date ?? null,
    hasHistory: readings.length > 1,
    comparison,
    improvedCount: comparison.filter((row) => row.direction === 'up').length,
    ignoredReadingCount,
  };
}
