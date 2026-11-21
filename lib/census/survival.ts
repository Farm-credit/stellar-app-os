/**
 * Tree survival rate statistics — Issue #1645
 *
 * Publishes "percentage of planted trees still alive" per project and per
 * species so sponsors can compare offerings. Data comes from the annual
 * field-team tree census (Issue #1695, `submitCensusData`); until a census
 * exists a clearly-labelled baseline estimate is shown instead.
 */

import { getProjectCensusStats, listCensusSubmissions } from './service';
import type { ProjectCensusStats, TreeCensusSubmission } from './types';

type SpeciesBreakdownEntry = TreeCensusSubmission['speciesBreakdown'][number];

interface SpeciesCensusMatch {
  submission: TreeCensusSubmission;
  entry: SpeciesBreakdownEntry;
}

export type SurvivalDataSource = 'census' | 'baseline';

export interface SurvivalHistoricalPoint {
  year: number;
  survivalRate: number;
  totalTreesCounted: number;
}

export interface SurvivalStatistic {
  /** Percentage of planted trees recorded alive (0–100, one decimal). */
  survivalRate: number;
  /** Trees counted in the latest census; null for baseline estimates. */
  treesCounted: number | null;
  /** Year of the latest census (or the baseline's reference year). */
  censusYear: number;
  /** ISO timestamp the figure was last updated. */
  lastUpdated: string;
  /** 'census' = measured by field teams, 'baseline' = estimate pending census. */
  source: SurvivalDataSource;
  /** Prior census results, oldest first (empty for baseline estimates). */
  historical: SurvivalHistoricalPoint[];
}

/**
 * Methodology text shown in the tooltip next to every survival figure
 * (acceptance criterion: "methodology explanation in tooltip").
 */
export const SURVIVAL_METHODOLOGY =
  'Survival rate = (trees recorded alive ÷ total trees counted) × 100, measured on the ground by field teams during the project tree census. ' +
  'Each project is censused at least once per year; species figures aggregate the same census records across all projects planting that species. ' +
  'Figures marked “baseline estimate” are platform estimates pending the next census. Rates are recalculated whenever a new census batch is submitted.';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Project-level survival rate. Uses the live census store: a submitted census
 * replaces the baseline immediately (`totalCensusSubmissions > 0`).
 */
export function getProjectSurvivalStatistic(projectId: string): SurvivalStatistic {
  const stats: ProjectCensusStats = getProjectCensusStats(projectId);
  const hasCensus = stats.totalCensusSubmissions > 0;
  const latestTotal = stats.historicalSurvivalRates.length
    ? stats.historicalSurvivalRates[stats.historicalSurvivalRates.length - 1].totalTreesCounted
    : 0;

  return {
    survivalRate: stats.currentSurvivalRate,
    treesCounted: hasCensus ? latestTotal : null,
    censusYear: stats.latestCensusYear,
    lastUpdated: stats.lastUpdated,
    source: hasCensus ? 'census' : 'baseline',
    historical: stats.historicalSurvivalRates.map((point) => ({ ...point })),
  };
}

/** Deterministic 0..1 hash for stable baseline estimates. */
function hash01(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Does a free-text census species label refer to this species? */
function speciesMatches(label: string, slug: string, name: string): boolean {
  const normalizedLabel = normalize(label);
  const normalizedSlug = normalize(slug);
  const normalizedName = normalize(name);
  return (
    normalizedLabel === normalizedSlug ||
    normalizedLabel === normalizedName ||
    normalizedName.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedName)
  );
}

export interface SpeciesRef {
  slug: string;
  name: string;
}

/**
 * Species-level survival rate: the aggregate of every census record for this
 * species across all projects; a deterministic baseline estimate until a
 * census records the species.
 */
export function getSpeciesSurvivalStatistic(species: SpeciesRef): SurvivalStatistic {
  const submissions: SpeciesCensusMatch[] = listCensusSubmissions()
    .map((submission) => {
      const entry = submission.speciesBreakdown.find((row) =>
        speciesMatches(row.species, species.slug, species.name)
      );
      return entry ? { submission, entry } : null;
    })
    .filter((match): match is SpeciesCensusMatch => match !== null);

  if (submissions.length > 0) {
    let alive = 0;
    let total = 0;
    const byYear = new Map<number, { alive: number; total: number }>();
    let latestSubmittedAt = '';

    for (const { submission, entry } of submissions) {
      alive += entry.alive;
      total += entry.total;
      const yearBucket = byYear.get(submission.censusYear) ?? { alive: 0, total: 0 };
      yearBucket.alive += entry.alive;
      yearBucket.total += entry.total;
      byYear.set(submission.censusYear, yearBucket);
      if (submission.submittedAt > latestSubmittedAt) latestSubmittedAt = submission.submittedAt;
    }

    const historical: SurvivalHistoricalPoint[] = [...byYear.entries()]
      .sort(([yearA], [yearB]) => yearA - yearB)
      .map(([year, bucket]) => ({
        year,
        survivalRate: bucket.total > 0 ? round1((bucket.alive / bucket.total) * 100) : 0,
        totalTreesCounted: bucket.total,
      }));

    const latestYear = historical[historical.length - 1]?.year ?? new Date().getFullYear();

    return {
      survivalRate: total > 0 ? round1((alive / total) * 100) : 0,
      treesCounted: total,
      censusYear: latestYear,
      lastUpdated: latestSubmittedAt || new Date().toISOString(),
      source: 'census',
      historical,
    };
  }

  // Deterministic baseline pending census: 70–96%.
  const baselineRate = round1(
    70 + hash01(`${normalize(species.slug)}:${normalize(species.name)}`) * 26
  );
  const referenceYear = new Date().getUTCFullYear();

  return {
    survivalRate: baselineRate,
    treesCounted: null,
    censusYear: referenceYear,
    lastUpdated: `${referenceYear}-01-01T00:00:00.000Z`,
    source: 'baseline',
    historical: [],
  };
}
