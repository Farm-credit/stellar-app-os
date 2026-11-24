/**
 * Annual biodiversity impact report — Issue #1630.
 *
 * Compiles one report per reforestation project per calendar year from data the
 * field teams already submit:
 *
 *   - `lib/census/service.ts`  — the annual tree census (`TreeCensusSubmission`
 *     with a per-species breakdown). Drives the Shannon diversity index and the
 *     survival / health recovery indicators.
 *   - `lib/wildlife/service.ts` — the wildlife sighting log. Drives the wildlife
 *     sighting section and the habitat quality score.
 *
 * The report itself is a pure projection: nothing is stored, so re-downloading a
 * year's report always reflects the submissions on file for that year. The
 * functions in the first half of this module are pure and fully unit-tested;
 * only `getProjectBiodiversityReports` touches the services.
 */

import { calculateShannonIndex, type SpeciesCount } from '@/lib/biodiversity/shannon-index';
import { computeHabitatQualityScore, HABITAT_SCORE_METHOD } from '@/lib/wildlife/habitat';
import { listSightings } from '@/lib/wildlife/service';
import type { TaxonomicGroup, WildlifeSighting } from '@/lib/wildlife/types';
import { listCensusSubmissions } from '@/lib/census/service';
import type { TreeCensusSubmission } from '@/lib/census/types';
import { scoreToRecoveryStatus } from '@/lib/biodiversity/recovery-score';
import type {
  AnnualBiodiversityReport,
  AnnualReportCadence,
  BaselineComparison,
  BiodiversityReportResult,
  EcosystemRecoveryIndicators,
  NotableWildlifeSpecies,
  RecoveryIndicator,
  ReportCoverage,
  ReportTrend,
  SpeciesDiversitySummary,
  WildlifeGroupSummary,
  WildlifeSightingSummary,
} from '@/lib/types/biodiversity-report';

/** Earliest year a report can cover; guards against nonsense route params. */
export const MIN_REPORT_YEAR = 2000;

/** How many species are called out by name in the report body. */
const NOTABLE_SPECIES_LIMIT = 5;

/** A trend smaller than this (in percent) is reported as stable. */
const TREND_EPSILON_PERCENT = 2;

/** Documented in the JSON response, the PDF footer and the docs page. */
export const REPORT_METHODOLOGY: readonly string[] = [
  'One report per project per calendar year. A year is finalised once it has ended (00:00 UTC on 1 January of the following year); the ongoing year is shown as a draft and is recompiled as new submissions arrive.',
  'Species diversity is the Shannon index H′ = −Σ pᵢ ln pᵢ with Pielou evenness J = H′ / ln S, computed from the annual census species breakdown (living stems). When a year has wildlife sightings but no census, the index falls back to sighting counts and is labelled as such.',
  'Wildlife counts come from the sighting log: field-team records are approved automatically, citizen-scientist records once reviewed. Only approved records feed the diversity and habitat figures; pending records are reported separately.',
  HABITAT_SCORE_METHOD,
  'Ecosystem recovery indicators combine the census survival rate and mean tree health with the habitat quality score; the recovery band uses the same 0–100 thresholds as the biodiversity oracle (degraded < 15, baseline < 35, early recovery < 60, recovering < 85, recovered ≥ 85).',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function yearOf(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).getUTCFullYear();
}

function startOfYearUtc(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

function trendBetween(previous: number | null, current: number | null): ReportTrend {
  if (previous === null || current === null || previous === 0) return 'unknown';
  const changePercent = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(changePercent) < TREND_EPSILON_PERCENT) return 'stable';
  return changePercent > 0 ? 'increasing' : 'decreasing';
}

/** Validates a `:year` route param or query value. */
export function parseReportYear(
  value: string | number | null,
  now: Date = new Date()
): BiodiversityReportResult<number> {
  const year = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(year) || year < MIN_REPORT_YEAR || year > now.getUTCFullYear()) {
    return {
      ok: false,
      error: 'invalid_year',
      message: `year must be an integer between ${MIN_REPORT_YEAR} and ${now.getUTCFullYear()}`,
    };
  }
  return { ok: true, value: year };
}

// ── Diversity ─────────────────────────────────────────────────────────────────

/** Aggregated living-stem counts per species for the period's census. */
function censusSpeciesCounts(submissions: readonly TreeCensusSubmission[]): SpeciesCount[] {
  const bySpecies = new Map<string, SpeciesCount>();

  for (const submission of submissions) {
    for (const row of submission.speciesBreakdown) {
      if (!row || row.alive <= 0) continue;
      const key = row.species.trim().toLowerCase();
      if (!key) continue;
      const existing = bySpecies.get(key);
      if (existing) {
        existing.count += row.alive;
      } else {
        bySpecies.set(key, { speciesId: key, speciesName: row.species.trim(), count: row.alive });
      }
    }
  }

  return [...bySpecies.values()].sort((a, b) => b.count - a.count);
}

/** Approved sightings collapsed into per-species abundance counts. */
function sightingSpeciesCounts(sightings: readonly WildlifeSighting[]): SpeciesCount[] {
  const approved = sightings.filter((sighting) => sighting.status === 'approved');
  const bySpecies = new Map<string, SpeciesCount>();

  for (const sighting of approved) {
    const key = sighting.speciesCommonName.trim().toLowerCase();
    if (!key) continue;
    const existing = bySpecies.get(key);
    if (existing) {
      existing.count += sighting.count;
    } else {
      bySpecies.set(key, {
        speciesId: key,
        speciesName: sighting.speciesCommonName.trim(),
        count: sighting.count,
      });
    }
  }

  return [...bySpecies.values()].sort((a, b) => b.count - a.count);
}

function buildDiversity(
  submissions: readonly TreeCensusSubmission[],
  sightings: readonly WildlifeSighting[]
): SpeciesDiversitySummary {
  const censusCounts = censusSpeciesCounts(submissions);
  const source = censusCounts.length > 0 ? 'census' : 'wildlife';
  const counts = censusCounts.length > 0 ? censusCounts : sightingSpeciesCounts(sightings);

  const index = calculateShannonIndex(counts);

  return {
    shannonIndex: round(index.shannonIndex),
    speciesRichness: index.speciesRichness,
    totalIndividuals: index.totalIndividuals,
    evenness: round(index.evenness),
    interpretation: index.interpretation,
    source: counts.length > 0 ? source : 'none',
  };
}

// ── Wildlife ──────────────────────────────────────────────────────────────────

function buildWildlife(sightings: readonly WildlifeSighting[]): WildlifeSightingSummary {
  const approved = sightings.filter((sighting) => sighting.status === 'approved');
  const pending = sightings.filter((sighting) => sighting.status === 'pending');

  const groups = new Map<TaxonomicGroup, { species: Set<string>; individuals: number }>();
  const species = new Map<
    string,
    {
      commonName: string;
      scientificName?: string;
      taxonomicGroup: TaxonomicGroup;
      individualCount: number;
      sightingCount: number;
      lastObservedAt: string;
    }
  >();

  for (const sighting of approved) {
    const group = groups.get(sighting.taxonomicGroup) ?? {
      species: new Set<string>(),
      individuals: 0,
    };
    group.individuals += sighting.count;
    groups.set(sighting.taxonomicGroup, group);

    const key = sighting.speciesCommonName.trim().toLowerCase();
    if (!key) continue;
    group.species.add(key);

    const existing = species.get(key);
    if (existing) {
      existing.individualCount += sighting.count;
      existing.sightingCount += 1;
      if (sighting.observedAt > existing.lastObservedAt) {
        existing.lastObservedAt = sighting.observedAt;
      }
      if (!existing.scientificName && sighting.scientificName) {
        existing.scientificName = sighting.scientificName;
      }
    } else {
      species.set(key, {
        commonName: sighting.speciesCommonName.trim(),
        scientificName: sighting.scientificName,
        taxonomicGroup: sighting.taxonomicGroup,
        individualCount: sighting.count,
        sightingCount: 1,
        lastObservedAt: sighting.observedAt,
      });
    }
  }

  const byGroup: WildlifeGroupSummary[] = [...groups.entries()]
    .map(([taxonomicGroup, group]) => ({
      taxonomicGroup,
      speciesCount: group.species.size,
      individualCount: group.individuals,
    }))
    .sort((a, b) => b.individualCount - a.individualCount || b.speciesCount - a.speciesCount);

  const notableSpecies: NotableWildlifeSpecies[] = [...species.values()]
    .sort((a, b) => b.individualCount - a.individualCount || b.sightingCount - a.sightingCount)
    .slice(0, NOTABLE_SPECIES_LIMIT);

  return {
    totalSightings: sightings.length,
    approvedSightings: approved.length,
    pendingSightings: pending.length,
    speciesRichness: species.size,
    individualsObserved: approved.reduce((sum, sighting) => sum + sighting.count, 0),
    byGroup,
    notableSpecies,
  };
}

// ── Recovery indicators ───────────────────────────────────────────────────────

function meanWeighted(values: ReadonlyArray<{ value: number; weight: number }>): number | null {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return null;
  return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function buildRecovery(params: {
  projectId: string;
  submissions: readonly TreeCensusSubmission[];
  periodSightings: readonly WildlifeSighting[];
  diversity: SpeciesDiversitySummary;
  previous: AnnualBiodiversityReport | null;
  now: Date;
}): EcosystemRecoveryIndicators {
  const totalTrees = params.submissions.reduce((sum, s) => sum + s.totalTreesCounted, 0);
  const aliveTrees = params.submissions.reduce((sum, s) => sum + s.aliveCount, 0);
  const survivalRate = totalTrees > 0 ? round((aliveTrees / totalTrees) * 100, 1) : null;

  const healthWeight = params.submissions.reduce((sum, s) => sum + s.totalTreesCounted, 0);
  const averageTreeHealthScore =
    healthWeight > 0
      ? round(
          params.submissions.reduce(
            (sum, s) => sum + s.averageHealthScore * s.totalTreesCounted,
            0
          ) / healthWeight,
          1
        )
      : null;

  const habitat = computeHabitatQualityScore(
    params.projectId,
    [...params.periodSightings],
    params.now
  );
  const habitatQualityScore = habitat.approvedSightings > 0 ? habitat.score : null;

  const previousDiversity = params.previous?.diversity.shannonIndex ?? null;
  const previousWildlife = params.previous?.wildlife.speciesRichness ?? null;

  const indicators: RecoveryIndicator[] = [
    {
      key: 'tree_survival',
      label: 'Tree survival rate',
      value: survivalRate,
      unit: 'percent',
      trend: trendBetween(params.previous?.recovery.treeSurvivalRate ?? null, survivalRate),
      note: 'Living stems divided by stems counted in the annual census.',
    },
    {
      key: 'tree_health',
      label: 'Mean tree health',
      value: averageTreeHealthScore,
      unit: 'score',
      trend: trendBetween(
        params.previous?.recovery.averageTreeHealthScore ?? null,
        averageTreeHealthScore
      ),
      note: 'Census health score (0–100), weighted by trees counted.',
    },
    {
      key: 'wildlife_richness',
      label: 'Wildlife species recorded',
      value: habitat.speciesRichness,
      unit: 'species',
      trend: trendBetween(previousWildlife, habitat.speciesRichness),
      note: 'Distinct species in approved sighting records.',
    },
    {
      key: 'habitat_quality',
      label: 'Habitat quality score',
      value: habitatQualityScore,
      unit: 'score',
      trend: trendBetween(
        params.previous?.recovery.habitatQualityScore ?? null,
        habitatQualityScore
      ),
      note: 'Composite of sighting evenness, richness and taxonomic group coverage.',
    },
    {
      key: 'diversity_trend',
      label: 'Shannon diversity H′',
      value: params.diversity.shannonIndex,
      unit: 'index',
      trend: trendBetween(previousDiversity, params.diversity.shannonIndex),
      note: 'Change against the previous year’s report.',
    },
  ];

  const composite = meanWeighted([
    { value: survivalRate ?? 0, weight: survivalRate === null ? 0 : 0.5 },
    { value: habitatQualityScore ?? 0, weight: habitatQualityScore === null ? 0 : 0.3 },
    { value: averageTreeHealthScore ?? 0, weight: averageTreeHealthScore === null ? 0 : 0.2 },
  ]);

  return {
    treeSurvivalRate: survivalRate,
    averageTreeHealthScore,
    wildlifeSpeciesRichness: habitat.speciesRichness,
    habitatQualityScore,
    habitatInterpretation: habitatQualityScore === null ? null : habitat.interpretation,
    recoveryStatus: composite === null ? null : scoreToRecoveryStatus(composite),
    indicators,
  };
}

// ── Coverage ──────────────────────────────────────────────────────────────────

function buildCoverage(
  submissions: readonly TreeCensusSubmission[],
  sightings: readonly WildlifeSighting[]
): ReportCoverage {
  const surveyors = [
    ...new Set(
      submissions
        .map((submission) => submission.surveyorName.trim())
        .filter((name) => name.length > 0)
    ),
  ].sort();

  const timestamps = [
    ...submissions.map((submission) => submission.submittedAt),
    ...sightings.map((sighting) => sighting.observedAt),
  ]
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort();

  return {
    censusSubmissions: submissions.length,
    surveyors,
    treesCounted: submissions.reduce((sum, submission) => sum + submission.totalTreesCounted, 0),
    wildlifeSubmissions: sightings.length,
    firstObservationAt: timestamps[0] ?? null,
    lastObservationAt: timestamps[timestamps.length - 1] ?? null,
  };
}

// ── Report assembly ───────────────────────────────────────────────────────────

export interface BuildReportParams {
  projectId: string;
  year: number;
  censusSubmissions: readonly TreeCensusSubmission[];
  sightings: readonly WildlifeSighting[];
  generatedAt?: Date;
  /** Report for the previous year, used for year-on-year trends. */
  previous?: AnnualBiodiversityReport | null;
  /** First year with data — the baseline for the long-term comparison. */
  baseline?: AnnualBiodiversityReport | null;
}

function buildBaselineComparison(
  current: { year: number; diversity: SpeciesDiversitySummary },
  baseline: AnnualBiodiversityReport | null | undefined
): BaselineComparison | null {
  if (!baseline || baseline.year === current.year) return null;

  const baselineIndex = baseline.diversity.shannonIndex;
  const changePercent =
    baselineIndex > 0
      ? round(((current.diversity.shannonIndex - baselineIndex) / baselineIndex) * 100, 1)
      : 0;
  const speciesChange = current.diversity.speciesRichness - baseline.diversity.speciesRichness;

  let trend: ReportTrend = 'stable';
  if (Math.abs(changePercent) >= TREND_EPSILON_PERCENT) {
    trend = changePercent > 0 ? 'increasing' : 'decreasing';
  }

  const direction =
    trend === 'increasing' ? 'improved' : trend === 'decreasing' ? 'declined' : 'remained stable';
  const speciesPart =
    speciesChange === 0
      ? 'species richness unchanged'
      : `species richness ${speciesChange > 0 ? 'up' : 'down'} from ${baseline.diversity.speciesRichness} to ${current.diversity.speciesRichness}`;

  return {
    baselineYear: baseline.year,
    baselineShannonIndex: baselineIndex,
    baselineSpeciesRichness: baseline.diversity.speciesRichness,
    changePercent,
    speciesChange,
    trend,
    summary: `Diversity has ${direction} ${Math.abs(changePercent).toFixed(1)}% since ${baseline.year}, with ${speciesPart}.`,
  };
}

/**
 * Builds the report for one project-year. Pure: pass the census submissions and
 * sighting log for the whole project, and only the requested year is used.
 */
export function buildAnnualBiodiversityReport(params: BuildReportParams): AnnualBiodiversityReport {
  const generatedAt = params.generatedAt ?? new Date();

  const periodCensus = params.censusSubmissions.filter(
    (submission) => submission.censusYear === params.year
  );
  const periodSightings = params.sightings.filter(
    (sighting) => yearOf(sighting.observedAt) === params.year
  );

  const diversity = buildDiversity(periodCensus, periodSightings);
  const previous = params.previous ?? null;

  return {
    projectId: params.projectId,
    year: params.year,
    status: params.year < generatedAt.getUTCFullYear() ? 'final' : 'in_progress',
    periodStart: startOfYearUtc(params.year).toISOString(),
    periodEnd: startOfYearUtc(params.year + 1).toISOString(),
    generatedAt: generatedAt.toISOString(),
    coverage: buildCoverage(periodCensus, periodSightings),
    diversity,
    wildlife: buildWildlife(periodSightings),
    recovery: buildRecovery({
      projectId: params.projectId,
      submissions: periodCensus,
      periodSightings,
      diversity,
      previous,
      now: generatedAt,
    }),
    baselineComparison: buildBaselineComparison({ year: params.year, diversity }, params.baseline),
    previousYear:
      previous && previous.diversity.shannonIndex > 0
        ? {
            year: previous.year,
            shannonIndex: previous.diversity.shannonIndex,
            changePercent: round(
              ((diversity.shannonIndex - previous.diversity.shannonIndex) /
                previous.diversity.shannonIndex) *
                100,
              1
            ),
          }
        : previous
          ? {
              year: previous.year,
              shannonIndex: previous.diversity.shannonIndex,
              changePercent: 0,
            }
          : null,
    pdfUrl: `/api/projects/${encodeURIComponent(params.projectId)}/biodiversity-report/${params.year}/pdf`,
    sourceSubmissionCount: periodCensus.length + periodSightings.length,
    methodology: [...REPORT_METHODOLOGY],
  };
}

/** Years that have at least one census submission or sighting, ascending. */
export function collectReportYears(
  censusSubmissions: readonly TreeCensusSubmission[],
  sightings: readonly WildlifeSighting[]
): number[] {
  const years = new Set<number>();

  for (const submission of censusSubmissions) {
    if (Number.isInteger(submission.censusYear)) years.add(submission.censusYear);
  }
  for (const sighting of sightings) {
    const year = yearOf(sighting.observedAt);
    if (year !== null) years.add(year);
  }

  return [...years].sort((a, b) => a - b);
}

/** Builds every available annual report for a project, newest year first. */
export function buildAnnualReportSeries(params: {
  projectId: string;
  censusSubmissions: readonly TreeCensusSubmission[];
  sightings: readonly WildlifeSighting[];
  generatedAt?: Date;
  years?: readonly number[];
}): AnnualBiodiversityReport[] {
  const generatedAt = params.generatedAt ?? new Date();
  const years = [
    ...(params.years ?? collectReportYears(params.censusSubmissions, params.sightings)),
  ]
    .filter((year) => Number.isInteger(year))
    .sort((a, b) => a - b);

  const ascending: AnnualBiodiversityReport[] = [];
  for (const year of years) {
    ascending.push(
      buildAnnualBiodiversityReport({
        projectId: params.projectId,
        year,
        censusSubmissions: params.censusSubmissions,
        sightings: params.sightings,
        generatedAt,
        previous: ascending[ascending.length - 1] ?? null,
        baseline: ascending[0] ?? null,
      })
    );
  }

  return ascending.reverse();
}

/** Annual cadence: which year is being compiled and when it becomes final. */
export function getAnnualReportCadence(
  reports: readonly AnnualBiodiversityReport[],
  now: Date = new Date()
): AnnualReportCadence {
  const currentReportYear = now.getUTCFullYear();
  const finalYears = reports
    .filter((report) => report.status === 'final')
    .map((report) => report.year);

  return {
    currentReportYear,
    lastFinalYear: finalYears.length > 0 ? Math.max(...finalYears) : null,
    finalizationDate: startOfYearUtc(currentReportYear + 1).toISOString(),
    availableYears: reports
      .map((report) => report.year)
      .filter((year, index, all) => all.indexOf(year) === index)
      .sort((a, b) => b - a),
    currentYearHasData: reports.some((report) => report.year === currentReportYear),
  };
}

/**
 * Every annual report for a project, newest first, built from the live census
 * and wildlife services. Callers that want the demo wildlife baseline should
 * seed it first (see `seedProjectWildlife`), exactly like `/api/wildlife/habitat`.
 */
export function getProjectBiodiversityReports(
  projectId: string,
  now: Date = new Date()
): AnnualBiodiversityReport[] {
  const censusSubmissions = listCensusSubmissions(projectId);
  const sightings = listSightings({ projectId });

  return buildAnnualReportSeries({
    projectId,
    censusSubmissions,
    sightings,
    generatedAt: now,
  });
}
