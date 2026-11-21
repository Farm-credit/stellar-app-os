import type { WaterImpactAssessment } from '@/lib/types/water-impact';

/**
 * Hydrological assessment feed placeholder.
 *
 * No assessment values are included until they are supplied by a verified
 * project source. This prevents the project page from presenting invented
 * water volumes as measured impact.
 */
export const mockWaterImpactAssessments: Record<string, WaterImpactAssessment[]> = {};

export function getMockWaterImpactAssessments(projectId: string): WaterImpactAssessment[] {
  return mockWaterImpactAssessments[projectId] ?? [];
}
