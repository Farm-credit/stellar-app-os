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
