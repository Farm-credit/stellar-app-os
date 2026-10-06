export interface ImpactMetric {
  value: number;
  unit: string;
  change: number;
}

export interface ProjectImpactSnapshot {
  asOf: string;
  emissionsReduced: ImpactMetric;
  jobsCreated: ImpactMetric;
  soilCarbonSequestered: ImpactMetric;
  waterQualityImproved: ImpactMetric;
  biodiversity: ImpactMetric;
}

/** The five project-level dimensions tracked by the offset-project dashboard (issue #1336). */
export type ProjectImpactDimension =
  | 'emissionsReduced'
  | 'jobsCreated'
  | 'soilCarbonSequestered'
  | 'waterQualityImproved'
  | 'biodiversity';

export interface ProjectImpactDimensionMeta {
  dimension: ProjectImpactDimension;
  label: string;
  unit: string;
}

export interface ProjectImpactRecord {
  projectId: string;
  dimension: ProjectImpactDimension;
  value: number;
  recordedAt: string;
}

/**
 * Transport shape returned by `GET /api/projects/:id/impact` and consumed by
 * the project-scoped impact dashboard.
 */
export interface ProjectImpactResponse {
  projectId: string;
  projectName: string;
  hasData: boolean;
  snapshot: ProjectImpactSnapshot;
  refreshedAt: string;
}

const DIMENSION_UNITS: Record<ProjectImpactDimension, string> = {
  emissionsReduced: 'tCO₂e',
  jobsCreated: 'jobs',
  soilCarbonSequestered: 'tCO₂e',
  waterQualityImproved: 'hectares',
  biodiversity: 'species',
};

/**
 * Ordered metadata for the five project impact KPIs. The order drives the
 * dashboard KPI grid and the units are the single source of truth used when a
 * dimension has no reported observations yet.
 */
export const PROJECT_IMPACT_DIMENSIONS: readonly ProjectImpactDimensionMeta[] = [
  { dimension: 'emissionsReduced', label: 'Emissions reduced', unit: DIMENSION_UNITS.emissionsReduced },
  { dimension: 'jobsCreated', label: 'Jobs created', unit: DIMENSION_UNITS.jobsCreated },
  {
    dimension: 'soilCarbonSequestered',
    label: 'Soil carbon sequestered',
    unit: DIMENSION_UNITS.soilCarbonSequestered,
  },
  {
    dimension: 'waterQualityImproved',
    label: 'Water quality improved',
    unit: DIMENSION_UNITS.waterQualityImproved,
  },
  { dimension: 'biodiversity', label: 'Biodiversity', unit: DIMENSION_UNITS.biodiversity },
] as const;

const BASELINE: Omit<ProjectImpactSnapshot, 'asOf'> = {
  emissionsReduced: { value: 125_000, unit: 'tCO₂e', change: 15.3 },
  jobsCreated: { value: 2_450, unit: 'jobs', change: 8.7 },
  soilCarbonSequestered: { value: 18_420, unit: 'tCO₂e', change: 12.1 },
  waterQualityImproved: { value: 7_860, unit: 'hectares', change: 9.4 },
  biodiversity: { value: 142, unit: 'projects', change: 18.2 },
};

/**
 * Builds a stable dashboard snapshot until the indexer/API supplies live data.
 * Keeping this deterministic makes loading and offline states predictable.
 */
export function buildProjectImpactSnapshot(asOf = new Date().toISOString()): ProjectImpactSnapshot {
  return {
    asOf,
    emissionsReduced: { ...BASELINE.emissionsReduced },
    jobsCreated: { ...BASELINE.jobsCreated },
    soilCarbonSequestered: { ...BASELINE.soilCarbonSequestered },
    waterQualityImproved: { ...BASELINE.waterQualityImproved },
    biodiversity: { ...BASELINE.biodiversity },
  };
}

export function formatImpactMetric(metric: ImpactMetric): string {
  return `${metric.value.toLocaleString()} ${metric.unit}`;
}

/**
 * True when at least one reported observation exists for `projectId`. The
 * dashboard uses this to distinguish "not yet reported" from "reported zero".
 */
export function hasProjectImpactRecords(
  records: readonly ProjectImpactRecord[],
  projectId: string
): boolean {
  return records.some((record) => record.projectId === projectId);
}

function sortByRecordedAt(records: readonly ProjectImpactRecord[]): ProjectImpactRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const timeA = Date.parse(a.record.recordedAt);
      const timeB = Date.parse(b.record.recordedAt);
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      // Stable tie-break so equal timestamps keep their declared order.
      return a.index - b.index;
    })
    .map(({ record }) => record);
}

function percentChange(latest: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0) {
    return 0;
  }
  return Math.round(((latest - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Aggregates reported observations for a single offset project into a
 * dashboard snapshot. Each dimension uses its most recent value and reports the
 * percentage change against the previous observation. Dimensions with no
 * observations are zero-filled (with their canonical unit) so the KPI grid can
 * always render all five metrics.
 *
 * Records for other projects are ignored, which keeps one project's dashboard
 * scoped to that project even when a shared feed is passed in.
 */
export function buildProjectImpactSnapshotFromRecords(
  projectId: string,
  records: readonly ProjectImpactRecord[],
  asOf: string = new Date().toISOString()
): ProjectImpactSnapshot {
  const scoped = sortByRecordedAt(records.filter((record) => record.projectId === projectId));

  const metricFor = (dimension: ProjectImpactDimension): ImpactMetric => {
    const unit = DIMENSION_UNITS[dimension];
    const observations = scoped.filter((record) => record.dimension === dimension);

    if (observations.length === 0) {
      return { value: 0, unit, change: 0 };
    }

    const latest = observations[observations.length - 1];
    const previous = observations.length > 1 ? observations[observations.length - 2] : undefined;

    return {
      value: latest.value,
      unit,
      change: previous ? percentChange(latest.value, previous.value) : 0,
    };
  };

  return {
    asOf,
    emissionsReduced: metricFor('emissionsReduced'),
    jobsCreated: metricFor('jobsCreated'),
    soilCarbonSequestered: metricFor('soilCarbonSequestered'),
    waterQualityImproved: metricFor('waterQualityImproved'),
    biodiversity: metricFor('biodiversity'),
  };
}
