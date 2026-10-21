import { describe, expect, it } from 'vitest';
import {
  buildProjectCoverageSummary,
  formatCoveragePercent,
  isValidCoverageTarget,
  quarterOf,
  type CoverageSnapshot,
  type ProjectCoverageRecord,
} from './project-coverage';
import { getMockProjectCoverage, mockProjectCoverageRecords } from '@/lib/api/mock/projectCoverage';

const snap = (
  date: string,
  canopyAreaHa: number,
  overrides: Partial<CoverageSnapshot> = {}
): CoverageSnapshot => ({
  date,
  source: 'satellite',
  projectAreaHa: 100,
  canopyAreaHa,
  ...overrides,
});

const record = (
  snapshots: CoverageSnapshot[],
  targetCoveragePercent = 70
): ProjectCoverageRecord => ({ projectId: 'proj-test', targetCoveragePercent, snapshots });

describe('quarterOf', () => {
  it('maps each month to the right calendar quarter', () => {
    expect(quarterOf('2026-01-01')).toEqual({ key: '2026-Q1', label: 'Q1 2026' });
    expect(quarterOf('2026-03-31')).toEqual({ key: '2026-Q1', label: 'Q1 2026' });
    expect(quarterOf('2026-04-01')).toEqual({ key: '2026-Q2', label: 'Q2 2026' });
    expect(quarterOf('2026-09-15')).toEqual({ key: '2026-Q3', label: 'Q3 2026' });
    expect(quarterOf('2026-12-31')).toEqual({ key: '2026-Q4', label: 'Q4 2026' });
  });

  it('returns null for unparseable dates or impossible months', () => {
    expect(quarterOf('not-a-date')).toBeNull();
    expect(quarterOf('')).toBeNull();
    expect(quarterOf('2026-13-01')).toBeNull();
    expect(quarterOf('2026-00-10')).toBeNull();
  });
});

describe('isValidCoverageTarget', () => {
  it('accepts values in (0, 100]', () => {
    expect(isValidCoverageTarget(0.1)).toBe(true);
    expect(isValidCoverageTarget(70)).toBe(true);
    expect(isValidCoverageTarget(100)).toBe(true);
  });

  it('rejects zero, negatives, >100 and non-finite values', () => {
    for (const bad of [0, -5, 100.01, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidCoverageTarget(bad)).toBe(false);
    }
  });
});

describe('buildProjectCoverageSummary', () => {
  it('reports latest coverage, gap and not-met status when below target', () => {
    const s = buildProjectCoverageSummary(
      record([snap('2026-03-18', 40), snap('2026-06-17', 55.5)])
    );
    expect(s.hasData).toBe(true);
    expect(s.latest?.coveragePercent).toBe(55.5);
    expect(s.latest?.quarterLabel).toBe('Q2 2026');
    expect(s.targetCoveragePercent).toBe(70);
    expect(s.targetMet).toBe(false);
    expect(s.gapPercentagePoints).toBe(14.5);
  });

  it('treats coverage exactly at the target as met (inclusive threshold)', () => {
    const s = buildProjectCoverageSummary(record([snap('2026-06-17', 70)]));
    expect(s.targetMet).toBe(true);
    expect(s.gapPercentagePoints).toBe(0);
  });

  it('treats coverage above the target as met with zero gap', () => {
    const s = buildProjectCoverageSummary(record([snap('2026-06-17', 83)]));
    expect(s.targetMet).toBe(true);
    expect(s.gapPercentagePoints).toBe(0);
  });

  it('judges "met" on the latest reading, not the best one ever', () => {
    const s = buildProjectCoverageSummary(record([snap('2026-03-18', 75), snap('2026-06-17', 65)]));
    expect(s.latest?.coveragePercent).toBe(65);
    expect(s.targetMet).toBe(false);
  });

  it('returns an explicit empty state when there are no snapshots', () => {
    const s = buildProjectCoverageSummary(record([]));
    expect(s.hasData).toBe(false);
    expect(s.latest).toBeNull();
    expect(s.trend).toEqual([]);
    expect(s.targetMet).toBe(false);
    expect(s.gapPercentagePoints).toBe(70);
  });

  it('handles a single snapshot (one-point trend)', () => {
    const s = buildProjectCoverageSummary(record([snap('2026-06-17', 10)]));
    expect(s.trend).toHaveLength(1);
    expect(s.latest).toBe(s.trend[0]);
  });

  it('sorts the trend oldest-first regardless of input order', () => {
    const s = buildProjectCoverageSummary(
      record([snap('2026-06-17', 30), snap('2025-12-11', 10), snap('2026-03-18', 20)])
    );
    expect(s.trend.map((p) => p.quarter)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2']);
    expect(s.trend.map((p) => p.coveragePercent)).toEqual([10, 20, 30]);
  });

  it('keeps one point per quarter, preferring the most recent snapshot', () => {
    const s = buildProjectCoverageSummary(
      record([
        snap('2026-07-02', 30, { source: 'drone' }),
        snap('2026-09-28', 34, { source: 'satellite' }),
        snap('2026-08-10', 32),
      ])
    );
    expect(s.trend).toHaveLength(1);
    expect(s.latest?.date).toBe('2026-09-28');
    expect(s.latest?.coveragePercent).toBe(34);
    expect(s.latest?.source).toBe('satellite');
  });

  it('ignores invalid snapshots instead of failing', () => {
    const s = buildProjectCoverageSummary(
      record([
        snap('2026-03-18', 20),
        snap('2026-06-17', 50, { projectAreaHa: 0 }),
        snap('garbage', 50),
        snap('2026-09-15', -1),
      ])
    );
    expect(s.trend).toHaveLength(1);
    expect(s.latest?.coveragePercent).toBe(20);
  });

  it('clamps coverage at 100% if canopy area exceeds project area', () => {
    const s = buildProjectCoverageSummary(record([snap('2026-06-17', 130)], 100));
    expect(s.latest?.coveragePercent).toBe(100);
    expect(s.targetMet).toBe(true);
  });

  it('throws RangeError for an invalid target threshold', () => {
    for (const bad of [0, -1, 101, Number.NaN]) {
      expect(() => buildProjectCoverageSummary(record([snap('2026-06-17', 10)], bad))).toThrow(
        RangeError
      );
    }
  });

  it('does not mutate the input snapshots', () => {
    const input = [snap('2026-06-17', 30), snap('2025-12-11', 10)];
    const copy = JSON.parse(JSON.stringify(input));
    buildProjectCoverageSummary(record(input));
    expect(input).toEqual(copy);
  });
});

describe('formatCoveragePercent', () => {
  it('shows at most one decimal place', () => {
    expect(formatCoveragePercent(54.6)).toBe('54.6');
    expect(formatCoveragePercent(70)).toBe('70');
    expect(formatCoveragePercent(12.345)).toBe('12.3');
  });
});

describe('mock project coverage data', () => {
  it('has a valid target and usable quarterly data for every record', () => {
    expect(mockProjectCoverageRecords.length).toBeGreaterThan(0);
    for (const rec of mockProjectCoverageRecords) {
      expect(isValidCoverageTarget(rec.targetCoveragePercent)).toBe(true);
      const s = buildProjectCoverageSummary(rec);
      expect(s.hasData).toBe(true);
      // every snapshot is a distinct quarter (quarterly cadence)
      expect(s.trend).toHaveLength(rec.snapshots.length);
    }
  });

  it('has one record per project id', () => {
    const ids = mockProjectCoverageRecords.map((r) => r.projectId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses satellite or drone as data sources', () => {
    for (const rec of mockProjectCoverageRecords) {
      for (const s of rec.snapshots) expect(['satellite', 'drone']).toContain(s.source);
    }
  });

  it('looks up proj-001 (forest) and returns nothing for proj-002 (wind farm)', () => {
    expect(getMockProjectCoverage('proj-001')?.targetCoveragePercent).toBe(70);
    expect(getMockProjectCoverage('proj-002')).toBeUndefined();
  });

  it('proj-001 trend rises to 54.6% against a 70% target', () => {
    const s = buildProjectCoverageSummary(getMockProjectCoverage('proj-001')!);
    expect(s.latest?.coveragePercent).toBe(54.6);
    expect(s.latest?.quarterLabel).toBe('Q3 2026');
    expect(s.targetMet).toBe(false);
    expect(s.gapPercentagePoints).toBe(15.4);
  });
});
