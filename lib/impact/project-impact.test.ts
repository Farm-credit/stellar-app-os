import { describe, expect, it } from 'vitest';
import { buildProjectImpactSnapshot, formatImpactMetric } from './project-impact';

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
});
