/**
 * Canopy analytics for project ecologists.
 *
 * Observations come from remote-sensing surveys (lidar, drone or satellite).
 * This module aggregates them into the series needed by the dashboard charts
 * and provides CSV / JSON serialisers suitable for scientific publications.
 */

export type CanopyDataSource = 'lidar' | 'drone' | 'satellite';

export const CANOPY_SOURCES: readonly CanopyDataSource[] = ['lidar', 'drone', 'satellite'];

export interface CanopySpeciesShare {
  species: string;
  /** Share of canopy area, percent (0-100). */
  percent: number;
}

export interface CanopySurvey {
  /** ISO date (YYYY-MM-DD) of the survey. */
  date: string;
  source: CanopyDataSource;
  /** Total surveyed project area in hectares. */
  projectAreaHa: number;
  /** Area covered by canopy in hectares. */
  canopyAreaHa: number;
  /** Per-crown height estimates in metres. */
  treeHeightsM: number[];
  species: CanopySpeciesShare[];
}

export interface CoveragePoint {
  date: string;
  source: CanopyDataSource;
  coveragePercent: number;
  canopyAreaHa: number;
}

export interface HeightBin {
  label: string;
  from: number;
  to: number;
  count: number;
}

export interface CanopySummary {
  latestCoveragePercent: number;
  latestCanopyAreaHa: number;
  meanHeightM: number;
  /** Canopy coverage change in percentage points per year. */
  growthRatePctPerYear: number;
  surveyCount: number;
}

/** Sample surveys used until a live remote-sensing feed is connected. */
export const SAMPLE_SURVEYS: CanopySurvey[] = [
  {
    date: '2023-03-15',
    source: 'satellite',
    projectAreaHa: 120,
    canopyAreaHa: 21.6,
    treeHeightsM: [1.2, 1.6, 2.1, 2.4, 2.8, 3.1, 3.3, 3.9, 4.4, 5.0],
    species: [
      { species: 'Mahogany', percent: 34 },
      { species: 'Iroko', percent: 26 },
      { species: 'Acacia', percent: 24 },
      { species: 'Other', percent: 16 },
    ],
  },
  {
    date: '2024-03-20',
    source: 'drone',
    projectAreaHa: 120,
    canopyAreaHa: 39.6,
    treeHeightsM: [2.4, 3.1, 3.6, 4.2, 4.8, 5.3, 5.9, 6.4, 7.2, 8.1],
    species: [
      { species: 'Mahogany', percent: 36 },
      { species: 'Iroko', percent: 27 },
      { species: 'Acacia', percent: 21 },
      { species: 'Other', percent: 16 },
    ],
  },
  {
    date: '2025-03-18',
    source: 'lidar',
    projectAreaHa: 120,
    canopyAreaHa: 62.4,
    treeHeightsM: [4.1, 5.2, 6.0, 6.8, 7.5, 8.3, 9.1, 10.2, 11.4, 12.9],
    species: [
      { species: 'Mahogany', percent: 38 },
      { species: 'Iroko', percent: 28 },
      { species: 'Acacia', percent: 18 },
      { species: 'Other', percent: 16 },
    ],
  },
  {
    date: '2026-03-17',
    source: 'lidar',
    projectAreaHa: 120,
    canopyAreaHa: 82.8,
    treeHeightsM: [6.2, 7.5, 8.4, 9.3, 10.1, 11.2, 12.4, 13.6, 14.9, 16.5],
    species: [
      { species: 'Mahogany', percent: 40 },
      { species: 'Iroko', percent: 29 },
      { species: 'Acacia', percent: 16 },
      { species: 'Other', percent: 15 },
    ],
  },
];

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function sortByDate(surveys: CanopySurvey[]): CanopySurvey[] {
  return [...surveys].sort((a, b) => a.date.localeCompare(b.date));
}

export function filterBySource(
  surveys: CanopySurvey[],
  source: CanopyDataSource | 'all'
): CanopySurvey[] {
  return source === 'all' ? surveys : surveys.filter((s) => s.source === source);
}

export function coveragePercent(survey: CanopySurvey): number {
  if (survey.projectAreaHa <= 0) return 0;
  return round((survey.canopyAreaHa / survey.projectAreaHa) * 100);
}

/** Canopy coverage percentage over time. */
export function buildCoverageSeries(surveys: CanopySurvey[]): CoveragePoint[] {
  return sortByDate(surveys).map((s) => ({
    date: s.date,
    source: s.source,
    coveragePercent: coveragePercent(s),
    canopyAreaHa: s.canopyAreaHa,
  }));
}

/** Species mix (percent of canopy) for a survey, for the donut chart. */
export function buildSpeciesMix(survey: CanopySurvey | undefined): CanopySpeciesShare[] {
  if (!survey) return [];
  return survey.species.filter((s) => s.percent > 0);
}

/** Histogram of canopy height estimates using fixed-width bins (metres). */
export function buildHeightHistogram(heights: number[], binWidthM = 2): HeightBin[] {
  if (heights.length === 0 || binWidthM <= 0) return [];
  const max = Math.max(...heights);
  const binCount = Math.floor(max / binWidthM) + 1;
  const bins: HeightBin[] = Array.from({ length: binCount }, (_, i) => ({
    from: i * binWidthM,
    to: (i + 1) * binWidthM,
    label: `${i * binWidthM}-${(i + 1) * binWidthM} m`,
    count: 0,
  }));
  for (const h of heights) {
    if (h < 0) continue;
    bins[Math.floor(h / binWidthM)].count += 1;
  }
  return bins;
}

export function meanHeight(heights: number[]): number {
  if (heights.length === 0) return 0;
  return round(heights.reduce((a, b) => a + b, 0) / heights.length);
}

/** Average change in coverage (percentage points / year) between first and last survey. */
export function growthRatePctPerYear(surveys: CanopySurvey[]): number {
  const sorted = sortByDate(surveys);
  if (sorted.length < 2) return 0;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const years = (Date.parse(last.date) - Date.parse(first.date)) / (365.25 * 24 * 3600 * 1000);
  if (!(years > 0)) return 0;
  return round((coveragePercent(last) - coveragePercent(first)) / years);
}

export function summarize(surveys: CanopySurvey[]): CanopySummary {
  const sorted = sortByDate(surveys);
  const latest = sorted[sorted.length - 1];
  return {
    latestCoveragePercent: latest ? coveragePercent(latest) : 0,
    latestCanopyAreaHa: latest ? latest.canopyAreaHa : 0,
    meanHeightM: latest ? meanHeight(latest.treeHeightsM) : 0,
    growthRatePctPerYear: growthRatePctPerYear(sorted),
    surveyCount: sorted.length,
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tidy CSV (one row per survey) with species shares and mean height as columns. */
export function surveysToCsv(surveys: CanopySurvey[]): string {
  const sorted = sortByDate(surveys);
  const speciesNames = Array.from(new Set(sorted.flatMap((s) => s.species.map((x) => x.species))));
  const header = [
    'date',
    'source',
    'project_area_ha',
    'canopy_area_ha',
    'coverage_percent',
    'mean_height_m',
    'max_height_m',
    ...speciesNames.map((n) => `species_${n.toLowerCase().replace(/\W+/g, '_')}_percent`),
  ];
  const rows = sorted.map((s) => [
    s.date,
    s.source,
    s.projectAreaHa,
    s.canopyAreaHa,
    coveragePercent(s),
    meanHeight(s.treeHeightsM),
    s.treeHeightsM.length ? Math.max(...s.treeHeightsM) : 0,
    ...speciesNames.map((n) => s.species.find((x) => x.species === n)?.percent ?? 0),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function surveysToJson(surveys: CanopySurvey[]): string {
  return JSON.stringify(
    { summary: summarize(surveys), surveys: sortByDate(surveys) },
    null,
    2
  );
}
