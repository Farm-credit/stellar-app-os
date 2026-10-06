import { describe, expect, it } from 'vitest';
import {
  PROJECT_IMPACT_DIMENSIONS,
  buildProjectImpactSnapshot,
  buildProjectImpactSnapshotFromRecords,
  formatImpactMetric,
  hasProjectImpactRecords,
  type ProjectImpactRecord,
} from './project-impact';
import { mockProjectImpactRecords } from '@/lib/api/mock/projectImpactRecords';

describe('project impact snapshots', () => {
  it('includes every v2 impact dimension with stable values', () => {
    const snapshot = buildProjectImpactSnapshot('2026-01-01T00:00:00.000Z');

    expect(snapshot).toMatchObject({
      asOf: '2026-01-01T00:00:00.000Z',
      emissionsReduced: { value: 125000, unit: 'tCO₂e' },
      jobsCreated: { value: 2450, unit: 'jobs' },
      soilCarbonSequestered: { value: 18420, unit: 'tCO₂e' },
      waterQualityImproved: { value: 7860, unit: 'hectares' },
      biodiversity: { value: 142, unit: 'projects' },
    });
  });

  it('formats values for accessible metric cards', () => {
    expect(formatImpactMetric({ value: 125000, unit: 'tCO₂e', change: 15.3 })).toBe('125,000 tCO₂e');
  });

  it('exposes ordered metadata for the five dashboard dimensions', () => {
    expect(PROJECT_IMPACT_DIMENSIONS.map((meta) => meta.dimension)).toEqual([
      'emissionsReduced',
      'jobsCreated',
      'soilCarbonSequestered',
      'waterQualityImproved',
      'biodiversity',
    ]);

    for (const meta of PROJECT_IMPACT_DIMENSIONS) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.unit.length).toBeGreaterThan(0);
    }
  });
});

describe('buildProjectImpactSnapshotFromRecords', () => {
  const records: ProjectImpactRecord[] = [
    {
      projectId: 'proj-001',
      dimension: 'emissionsReduced',
      value: 100,
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      projectId: 'proj-001',
      dimension: 'emissionsReduced',
      value: 125,
      recordedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      projectId: 'proj-002',
      dimension: 'emissionsReduced',
      value: 9_999,
      recordedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      projectId: 'proj-002',
      dimension: 'biodiversity',
      value: 42,
      recordedAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  it('uses the latest observation and reports change against the previous one', () => {
    const snapshot = buildProjectImpactSnapshotFromRecords(
      'proj-001',
      records,
      '2026-03-01T00:00:00.000Z'
    );

    expect(snapshot.asOf).toBe('2026-03-01T00:00:00.000Z');
    expect(snapshot.emissionsReduced).toEqual({ value: 125, unit: 'tCO₂e', change: 25 });
  });

  it('scopes aggregation to the requested project', () => {
    const snapshot = buildProjectImpactSnapshotFromRecords('proj-002', records);

    expect(snapshot.emissionsReduced.value).toBe(9_999);
    expect(snapshot.biodiversity.value).toBe(42);
    expect(snapshot.jobsCreated.value).toBe(0);
  });

  it('zero-fills dimensions without observations so the KPI grid always renders', () => {
    const snapshot = buildProjectImpactSnapshotFromRecords('proj-002', records);

    expect(snapshot.jobsCreated).toEqual({ value: 0, unit: 'jobs', change: 0 });
    expect(snapshot.soilCarbonSequestered).toEqual({ value: 0, unit: 'tCO₂e', change: 0 });
    expect(snapshot.waterQualityImproved).toEqual({ value: 0, unit: 'hectares', change: 0 });
  });

  it('returns an all-zero snapshot for a project without observations', () => {
    const snapshot = buildProjectImpactSnapshotFromRecords('proj-missing', records);

    expect(snapshot.emissionsReduced.value).toBe(0);
    expect(snapshot.jobsCreated.value).toBe(0);
    expect(snapshot.soilCarbonSequestered.value).toBe(0);
    expect(snapshot.waterQualityImproved.value).toBe(0);
    expect(snapshot.biodiversity.value).toBe(0);
  });

  it('does not divide by zero when the previous observation is zero', () => {
    const zeroRecords: ProjectImpactRecord[] = [
      {
        projectId: 'proj-001',
        dimension: 'jobsCreated',
        value: 0,
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        projectId: 'proj-001',
        dimension: 'jobsCreated',
        value: 5,
        recordedAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    const snapshot = buildProjectImpactSnapshotFromRecords('proj-001', zeroRecords);
    expect(snapshot.jobsCreated).toEqual({ value: 5, unit: 'jobs', change: 0 });
  });

  it('is order-independent when observations carry timestamps', () => {
    const asOf = '2026-03-01T00:00:00.000Z';

    expect(buildProjectImpactSnapshotFromRecords('proj-001', [...records].reverse(), asOf)).toEqual(
      buildProjectImpactSnapshotFromRecords('proj-001', records, asOf)
    );
  });
});

describe('project impact record feed', () => {
  it('distinguishes projects with observations from those without', () => {
    expect(hasProjectImpactRecords(mockProjectImpactRecords, 'proj-001')).toBe(true);
    expect(hasProjectImpactRecords(mockProjectImpactRecords, 'proj-003')).toBe(false);
  });

  it('maps the reported feed onto the five dashboard metrics', () => {
    const snapshot = buildProjectImpactSnapshotFromRecords(
      'proj-001',
      mockProjectImpactRecords,
      '2026-05-01T00:00:00.000Z'
    );

    expect(snapshot.emissionsReduced.value).toBe(121_900);
    expect(snapshot.jobsCreated.value).toBe(1_315);
    expect(snapshot.soilCarbonSequestered.value).toBe(21_980);
    expect(snapshot.waterQualityImproved.value).toBe(3_860);
    expect(snapshot.biodiversity.value).toBe(112);
    expect(snapshot.biodiversity.change).toBeCloseTo(16.7, 1);
  });
});
