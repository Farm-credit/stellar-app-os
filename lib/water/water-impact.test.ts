import { describe, expect, it } from 'vitest';
import { formatLitres, normalizeWaterImpactAssessments } from './water-impact';

describe('water impact helpers', () => {
  it('sorts annual assessments and preserves reported metrics without calculating them', () => {
    const result = normalizeWaterImpactAssessments([
      {
        year: 2026,
        watershedProtectionLitres: 1200,
        estimatedGroundwaterRechargeLitres: 800,
        protectedLitresPerYear: 2000,
        assessedAt: '2026-06-01',
        source: 'hydrology-report-2026',
      },
      {
        year: 2025,
        watershedProtectionLitres: 900,
        estimatedGroundwaterRechargeLitres: 600,
        protectedLitresPerYear: 1500,
        assessedAt: '2025-06-01',
        source: 'hydrology-report-2025',
      },
    ]);

    expect(result.map((assessment) => assessment.year)).toEqual([2025, 2026]);
    expect(result[1].protectedLitresPerYear).toBe(2000);
  });

  it('drops invalid negative, non-finite, and undated observations', () => {
    expect(
      normalizeWaterImpactAssessments([
        {
          year: 2026,
          watershedProtectionLitres: -1,
          estimatedGroundwaterRechargeLitres: 0,
          protectedLitresPerYear: 0,
          assessedAt: '2026-06-01',
          source: 'invalid',
        },
        {
          year: 2025,
          watershedProtectionLitres: null,
          estimatedGroundwaterRechargeLitres: Number.NaN,
          protectedLitresPerYear: 0,
          assessedAt: '2025-06-01',
          source: 'invalid',
        },
        {
          year: 2024,
          watershedProtectionLitres: 0,
          estimatedGroundwaterRechargeLitres: 0,
          protectedLitresPerYear: 0,
          assessedAt: 'not-a-date',
          source: 'invalid',
        },
      ])
    ).toEqual([]);
  });

  it('formats reported and unavailable litre values clearly', () => {
    expect(formatLitres(1234567)).toBe('1,234,567 L');
    expect(formatLitres(null)).toBe('Not reported');
  });
});
