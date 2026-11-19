import type { ProjectImpactRecord } from '@/lib/impact/project-impact';

/**
 * Reported project-level impact measurements (v1 mock feed).
 *
 * Each row is one observation for a project + dimension. This mirrors the
 * shape the project impact indexer will emit, so swapping this module for the
 * live feed does not change the aggregation or the dashboard. Projects without
 * rows (for example `proj-003`) deliberately render the dashboard empty state.
 */
export const mockProjectImpactRecords: ProjectImpactRecord[] = [
  // proj-001 — Amazon Rainforest Reforestation
  { projectId: 'proj-001', dimension: 'emissionsReduced', value: 96_400, recordedAt: '2025-10-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'emissionsReduced', value: 108_250, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'emissionsReduced', value: 121_900, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'jobsCreated', value: 1_180, recordedAt: '2025-10-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'jobsCreated', value: 1_240, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'jobsCreated', value: 1_315, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'soilCarbonSequestered', value: 18_420, recordedAt: '2025-10-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'soilCarbonSequestered', value: 20_110, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'soilCarbonSequestered', value: 21_980, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'waterQualityImproved', value: 3_120, recordedAt: '2025-10-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'waterQualityImproved', value: 3_480, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'waterQualityImproved', value: 3_860, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'biodiversity', value: 84, recordedAt: '2025-10-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'biodiversity', value: 96, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-001', dimension: 'biodiversity', value: 112, recordedAt: '2026-04-01T00:00:00.000Z' },

  // proj-002 — Wind Energy Farm, Texas (no soil/water reporting yet)
  { projectId: 'proj-002', dimension: 'emissionsReduced', value: 145_000, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-002', dimension: 'emissionsReduced', value: 156_800, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-002', dimension: 'jobsCreated', value: 320, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-002', dimension: 'jobsCreated', value: 348, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-002', dimension: 'biodiversity', value: 12, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-002', dimension: 'biodiversity', value: 14, recordedAt: '2026-04-01T00:00:00.000Z' },

  // proj-004 — Mangrove Restoration, Indonesia
  { projectId: 'proj-004', dimension: 'emissionsReduced', value: 74_200, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'emissionsReduced', value: 81_900, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'jobsCreated', value: 640, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'jobsCreated', value: 705, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'soilCarbonSequestered', value: 22_100, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'soilCarbonSequestered', value: 24_900, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'waterQualityImproved', value: 1_980, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'waterQualityImproved', value: 2_260, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'biodiversity', value: 156, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-004', dimension: 'biodiversity', value: 173, recordedAt: '2026-04-01T00:00:00.000Z' },

  // proj-005 — Sustainable Agriculture, Kenya
  { projectId: 'proj-005', dimension: 'emissionsReduced', value: 18_900, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'emissionsReduced', value: 21_400, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'jobsCreated', value: 2_450, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'jobsCreated', value: 2_610, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'soilCarbonSequestered', value: 12_600, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'soilCarbonSequestered', value: 15_300, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'waterQualityImproved', value: 870, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'waterQualityImproved', value: 990, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'biodiversity', value: 38, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-005', dimension: 'biodiversity', value: 45, recordedAt: '2026-04-01T00:00:00.000Z' },

  // proj-009 — Northern Nigeria Savannah Agro-Forestry
  { projectId: 'proj-009', dimension: 'emissionsReduced', value: 27_300, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'emissionsReduced', value: 30_600, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'jobsCreated', value: 890, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'jobsCreated', value: 960, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'soilCarbonSequestered', value: 9_800, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'soilCarbonSequestered', value: 11_250, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'waterQualityImproved', value: 640, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'waterQualityImproved', value: 715, recordedAt: '2026-04-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'biodiversity', value: 52, recordedAt: '2026-01-01T00:00:00.000Z' },
  { projectId: 'proj-009', dimension: 'biodiversity', value: 61, recordedAt: '2026-04-01T00:00:00.000Z' },
];

/** All reported observations for one project, in declaration order. */
export function getMockProjectImpactRecords(projectId: string): ProjectImpactRecord[] {
  return mockProjectImpactRecords.filter((record) => record.projectId === projectId);
}
