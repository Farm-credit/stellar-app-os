import { describe, expect, it } from 'vitest';
import {
  buildProjectSoilHealthReport,
  normalizeSoilReadings,
  type ProjectSoilHealthData,
  type SoilHealthReading,
} from '@/lib/services/project-soil-health';

const reading = (overrides: Partial<SoilHealthReading> = {}): SoilHealthReading => ({
  date: '2026-01-15',
  ph: 6,
  nitrogenMgKg: 200,
  moisturePercent: 25,
  organicMatterPercent: 3,
  ...overrides,
});

const data = (readings: SoilHealthReading[]): ProjectSoilHealthData => ({
  source: 'Test field team',
  isSampleData: false,
  readings,
});

describe('normalizeSoilReadings', () => {
  it('orders readings chronologically regardless of input order', () => {
    const { readings, ignoredReadingCount } = normalizeSoilReadings([
      reading({ date: '2026-01-15', ph: 6.5 }),
      reading({ date: '2024-01-15', ph: 5.5 }),
    ]);

    expect(readings.map((r) => r.date)).toEqual(['2024-01-15', '2026-01-15']);
    expect(ignoredReadingCount).toBe(0);
  });

  it('keeps one reading per date, preferring the last recorded', () => {
    const { readings } = normalizeSoilReadings([
      reading({ date: '2024-01-15', ph: 5 }),
      reading({ date: '2024-01-15', ph: 5.4 }),
    ]);

    expect(readings).toHaveLength(1);
    expect(readings[0].ph).toBe(5.4);
  });

  it('drops undated, unparseable and partially-measured readings instead of plotting zeros', () => {
    const { readings, ignoredReadingCount } = normalizeSoilReadings([
      reading({ date: '2024-01-15' }),
      reading({ date: 'not-a-date' }),
      reading({ date: '2025-01-15', nitrogenMgKg: Number.NaN }),
      reading({ date: '2026-01-15', moisturePercent: Number.POSITIVE_INFINITY }),
    ]);

    expect(readings.map((r) => r.date)).toEqual(['2024-01-15']);
    expect(ignoredReadingCount).toBe(3);
  });
});

describe('buildProjectSoilHealthReport', () => {
  it('compares the earliest reading with the latest per indicator', () => {
    const report = buildProjectSoilHealthReport(
      'proj-001',
      data([
        reading({
          date: '2024-01-15',
          ph: 5.2,
          nitrogenMgKg: 185,
          moisturePercent: 19,
          organicMatterPercent: 2.2,
        }),
        reading({
          date: '2026-01-15',
          ph: 5.8,
          nitrogenMgKg: 218,
          moisturePercent: 23,
          organicMatterPercent: 2.8,
        }),
      ])
    );

    expect(report.hasHistory).toBe(true);
    expect(report.baselineDate).toBe('2024-01-15');
    expect(report.latestDate).toBe('2026-01-15');
    expect(report.improvedCount).toBe(4);

    const ph = report.comparison.find((row) => row.key === 'ph')!;
    expect(ph).toMatchObject({ baseline: 5.2, latest: 5.8, direction: 'up' });
    expect(ph.change).toBeCloseTo(0.6, 10);
    expect(ph.changePercent).toBeCloseTo(11.5, 5);
    // pH 5.2 / 14 and 5.8 / 14 on the radar scale.
    expect(ph.baselinePercentOfScale).toBeCloseTo(37.142857, 4);
    expect(ph.latestPercentOfScale).toBeCloseTo(41.428571, 4);

    const nitrogen = report.comparison.find((row) => row.key === 'nitrogenMgKg')!;
    expect(nitrogen.changePercent).toBeCloseTo(17.8, 5);
  });

  it('flags declining and unchanged indicators', () => {
    const report = buildProjectSoilHealthReport(
      'proj-002',
      data([
        reading({ date: '2024-01-15', moisturePercent: 30, organicMatterPercent: 2 }),
        reading({ date: '2026-01-15', moisturePercent: 24, organicMatterPercent: 2 }),
      ])
    );

    const moisture = report.comparison.find((row) => row.key === 'moisturePercent')!;
    const organicMatter = report.comparison.find((row) => row.key === 'organicMatterPercent')!;

    expect(moisture.direction).toBe('down');
    expect(moisture.change).toBe(-6);
    expect(organicMatter.direction).toBe('flat');
    expect(organicMatter.changePercent).toBe(0);
  });

  it('reports no history for a single reading', () => {
    const report = buildProjectSoilHealthReport('proj-003', data([reading()]));

    expect(report.hasHistory).toBe(false);
    expect(report.improvedCount).toBe(0);
    expect(report.comparison.every((row) => row.change === 0)).toBe(true);
  });

  it('clamps radar percentages to the published 0–100 scale', () => {
    const report = buildProjectSoilHealthReport(
      'proj-004',
      data([
        reading({ date: '2024-01-15', ph: 9, nitrogenMgKg: 900, moisturePercent: 80 }),
        reading({ date: '2026-01-15', ph: -1, nitrogenMgKg: 0, moisturePercent: 0 }),
      ])
    );

    const ph = report.comparison.find((row) => row.key === 'ph')!;
    const nitrogen = report.comparison.find((row) => row.key === 'nitrogenMgKg')!;
    const moisture = report.comparison.find((row) => row.key === 'moisturePercent')!;

    expect(nitrogen.baselinePercentOfScale).toBe(100);
    expect(nitrogen.latestPercentOfScale).toBe(0);
    expect(moisture.baselinePercentOfScale).toBe(100);
    expect(ph.latestPercentOfScale).toBe(0);
  });

  it('reports change percent as null when the baseline is zero', () => {
    const report = buildProjectSoilHealthReport(
      'proj-005',
      data([
        reading({ date: '2024-01-15', organicMatterPercent: 0 }),
        reading({ date: '2026-01-15', organicMatterPercent: 1.5 }),
      ])
    );

    const organicMatter = report.comparison.find((row) => row.key === 'organicMatterPercent')!;
    expect(organicMatter.changePercent).toBeNull();
    expect(organicMatter.direction).toBe('up');
  });

  it('carries provenance through to the report', () => {
    const report = buildProjectSoilHealthReport('proj-006', {
      source: 'Illustrative field-team sample',
      isSampleData: true,
      readings: [reading()],
    });

    expect(report.source).toBe('Illustrative field-team sample');
    expect(report.isSampleData).toBe(true);
    expect(report.projectId).toBe('proj-006');
  });
});
