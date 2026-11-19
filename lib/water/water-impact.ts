import type { WaterImpactAssessment } from '@/lib/types/water-impact';

/**
 * Keeps annual assessments deterministic for the chart and removes values
 * that cannot be presented as measured hydrological data.
 */
export function normalizeWaterImpactAssessments(
  assessments: readonly WaterImpactAssessment[]
): WaterImpactAssessment[] {
  return assessments
    .filter(
      (assessment) =>
        Number.isInteger(assessment.year) &&
        assessment.year > 0 &&
        isValidDate(assessment.assessedAt) &&
        hasValidMetric(assessment.watershedProtectionLitres) &&
        hasValidMetric(assessment.estimatedGroundwaterRechargeLitres) &&
        hasValidMetric(assessment.protectedLitresPerYear)
    )
    .slice()
    .sort((a, b) => a.year - b.year);
}

export function formatLitres(value: number | null): string {
  return value === null ? 'Not reported' : `${value.toLocaleString('en-US')} L`;
}

function hasValidMetric(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
