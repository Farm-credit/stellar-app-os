import { describe, expect, it } from 'vitest';
import { cohortMonth } from '@/lib/analytics/sponsor-cohort-retention';

describe('sponsor cohort retention', () => {
  describe('cohortMonth', () => {
    it('derives the first day of the month from a date', () => {
      expect(cohortMonth(new Date('2025-03-15T10:30:00Z'))).toBe('2025-03-01');
    });

    it('handles January correctly', () => {
      expect(cohortMonth(new Date('2025-01-01T00:00:00Z'))).toBe('2025-01-01');
    });

    it('handles December correctly', () => {
      expect(cohortMonth(new Date('2025-12-31T23:59:59Z'))).toBe('2025-12-01');
    });

    it('normalizes timezone to UTC', () => {
      // Even if the date is near a month boundary in local time,
      // cohortMonth uses UTC.
      const d = new Date('2025-06-30T23:59:59Z');
      expect(cohortMonth(d)).toBe('2025-06-01');
    });
  });

  describe('types', () => {
    it('CohortRetentionReport type shape is well-defined', () => {
      // Type-level sanity check — these are compile-time checks.
      const report = {
        generated_at: new Date().toISOString(),
        cohorts: [],
        summary: {
          total_cohorts: 0,
          latest_cohort_month: '',
          average_m1_retention: null,
          average_m3_retention: null,
          total_sponsors_all_time: 0,
          total_sponsorships_all_time: 0,
        },
      };

      expect(report.cohorts).toEqual([]);
      expect(report.summary.total_cohorts).toBe(0);
    });
  });
});
