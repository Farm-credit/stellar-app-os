import type { ProjectCoverageRecord } from '@/lib/canopy/project-coverage';

/**
 * Forest coverage records (v1 mock feed), one per forest project.
 *
 * `targetCoveragePercent` is the per-project target threshold. `snapshots` are
 * the quarterly satellite / drone readings of canopy area vs. project area.
 * This mirrors the shape the quarterly imagery pipeline will emit, so swapping
 * this module for the live feed does not change the logic or the UI.
 *
 * Projects without a record (for example `proj-002`, a wind farm) simply do not
 * show the forest coverage tracker.
 */
export const mockProjectCoverageRecords: ProjectCoverageRecord[] = [
  {
    // proj-001 — Amazon Rainforest Reforestation (4,800 ha)
    projectId: 'proj-001',
    targetCoveragePercent: 70,
    snapshots: [
      { date: '2024-12-12', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 600 },
      { date: '2025-03-14', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 873.6 },
      { date: '2025-06-19', source: 'drone', projectAreaHa: 4800, canopyAreaHa: 1152 },
      { date: '2025-09-16', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 1430.4 },
      { date: '2025-12-11', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 1708.8 },
      { date: '2026-03-18', source: 'drone', projectAreaHa: 4800, canopyAreaHa: 2011.2 },
      { date: '2026-06-17', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 2318.4 },
      { date: '2026-09-15', source: 'satellite', projectAreaHa: 4800, canopyAreaHa: 2620.8 },
    ],
  },
];

/** Coverage record for a project id (`proj-001`), or undefined if it has none. */
export function getMockProjectCoverage(projectId: string): ProjectCoverageRecord | undefined {
  return mockProjectCoverageRecords.find((record) => record.projectId === projectId);
}
