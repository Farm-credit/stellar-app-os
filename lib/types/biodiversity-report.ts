/**
 * Annual biodiversity impact report — Issue #1630.
 *
 * One downloadable report per reforestation project per calendar year,
 * documenting the species diversity index, wildlife sightings recorded by the
 * field team, and the ecosystem recovery indicators derived from the annual
 * tree census.
 *
 * Everything here is derived from data the field teams already submit through
 * two existing pipelines — `lib/census/service.ts` (annual tree census) and
 * `lib/wildlife/service.ts` (wildlife sighting log) — so the report never
 * introduces a second source of truth.
 */

import type { RecoveryStatus } from '@/lib/types/biodiversity';
import type { TaxonomicGroup } from '@/lib/wildlife/types';

/** A completed calendar year's report is `final`; the current year is drafted. */
export type ReportPeriodStatus = 'in_progress' | 'final';

/** Which field survey fed the Shannon diversity index. */
export type DiversityDataSource = 'census' | 'wildlife' | 'none';

export type ReportTrend = 'increasing' | 'decreasing' | 'stable' | 'unknown';

/** Species diversity index for one report period (AC1). */
export interface SpeciesDiversitySummary {
  /** Shannon diversity index H′ = −Σ pᵢ ln pᵢ. */
  shannonIndex: number;
  /** Number of distinct species observed. */
  speciesRichness: number;
  /** Individuals counted across all species. */
  totalIndividuals: number;
  /** Pielou evenness J = H′ / ln S (0–1). */
  evenness: number;
  /** Plain-language reading of H′. */
  interpretation: string;
  /** Which survey produced the counts above. */
  source: DiversityDataSource;
}

/** One taxonomic group present in the period's sighting log. */
export interface WildlifeGroupSummary {
  taxonomicGroup: TaxonomicGroup;
  speciesCount: number;
  individualCount: number;
}

/** A species worth calling out in the report body. */
export interface NotableWildlifeSpecies {
  commonName: string;
  scientificName?: string;
  taxonomicGroup: TaxonomicGroup;
  /** Total individuals seen across the period. */
  individualCount: number;
  sightingCount: number;
  lastObservedAt: string;
}

/** Wildlife sightings recorded by the field team in the period (AC1). */
export interface WildlifeSightingSummary {
  totalSightings: number;
  approvedSightings: number;
  pendingSightings: number;
  speciesRichness: number;
  individualsObserved: number;
  byGroup: WildlifeGroupSummary[];
  notableSpecies: NotableWildlifeSpecies[];
}

/** One ecosystem recovery indicator with its year-on-year movement. */
export interface RecoveryIndicator {
  key:
    'tree_survival' | 'tree_health' | 'wildlife_richness' | 'diversity_trend' | 'habitat_quality';
  label: string;
  /** Numeric value in the indicator's own unit, or null when not measured. */
  value: number | null;
  unit: 'percent' | 'score' | 'species' | 'index';
  /** Movement against the previous year's report, when one exists. */
  trend: ReportTrend;
  /** Short explanation of how the value is derived. */
  note: string;
}

/** Ecosystem recovery indicators (AC1). */
export interface EcosystemRecoveryIndicators {
  /** From the annual census: survivors / trees counted × 100. */
  treeSurvivalRate: number | null;
  /** From the annual census: mean tree health score (0–100). */
  averageTreeHealthScore: number | null;
  /** From the wildlife log: distinct approved species. */
  wildlifeSpeciesRichness: number;
  /** Composite habitat quality score (0–100) from the wildlife log. */
  habitatQualityScore: number | null;
  habitatInterpretation: string | null;
  /** Recovery band implied by the indicator mix. */
  recoveryStatus: RecoveryStatus | null;
  indicators: RecoveryIndicator[];
}

/** Comparison of this period's diversity index to the project's first year. */
export interface BaselineComparison {
  baselineYear: number;
  baselineShannonIndex: number;
  baselineSpeciesRichness: number;
  changePercent: number;
  speciesChange: number;
  trend: ReportTrend;
  summary: string;
}

/** Field coverage — proves the report is backed by submissions, not mocks. */
export interface ReportCoverage {
  censusSubmissions: number;
  surveyors: string[];
  treesCounted: number;
  wildlifeSubmissions: number;
  firstObservationAt: string | null;
  lastObservationAt: string | null;
}

/** The downloadable annual report for one project (AC1 + AC3). */
export interface AnnualBiodiversityReport {
  projectId: string;
  year: number;
  status: ReportPeriodStatus;
  periodStart: string;
  /** Exclusive end of the period (00:00 UTC on Jan 1 of the next year). */
  periodEnd: string;
  generatedAt: string;
  coverage: ReportCoverage;
  diversity: SpeciesDiversitySummary;
  wildlife: WildlifeSightingSummary;
  recovery: EcosystemRecoveryIndicators;
  baselineComparison: BaselineComparison | null;
  previousYear: { year: number; shannonIndex: number; changePercent: number } | null;
  /** Route that renders this report as a PDF (AC3). */
  pdfUrl: string;
  /** Number of field submissions behind the report; 0 means "no data yet". */
  sourceSubmissionCount: number;
  methodology: string[];
}

/** Annual cadence state for a project's reports. */
export interface AnnualReportCadence {
  /** Calendar year currently being compiled. */
  currentReportYear: number;
  /** Latest year whose report is finalised (period complete). */
  lastFinalYear: number | null;
  /** When the ongoing year's report becomes final (00:00 UTC, Jan 1). */
  finalizationDate: string;
  /** Every year with enough field data to render a report, newest first. */
  availableYears: number[];
  /** True when the ongoing year already has field submissions. */
  currentYearHasData: boolean;
}

/** Response body of `GET /api/projects/[id]/biodiversity-report`. */
export interface BiodiversityReportListResponse {
  projectId: string;
  cadence: AnnualReportCadence;
  reports: AnnualBiodiversityReport[];
  methodology: string[];
}

/** Reason a report request was rejected. */
export type BiodiversityReportErrorCode = 'project_not_found' | 'invalid_year' | 'no_survey_data';

export type BiodiversityReportResult<T> =
  { ok: true; value: T } | { ok: false; error: BiodiversityReportErrorCode; message: string };
