import { describe, expect, it } from 'vitest';
import { getReachedTreeMilestones } from './milestones';

describe('getReachedTreeMilestones', () => {
  it('returns each milestone reached by the requested date', () => {
    expect(
      getReachedTreeMilestones('2020-01-15T12:00:00.000Z', new Date('2025-01-15T12:00:00.000Z'))
    ).toEqual([
      {
        id: 'six-months',
        label: '6-month milestone',
        months: 6,
        reachedAt: '2020-07-15T12:00:00.000Z',
        ageYears: 0.5,
      },
      {
        id: 'one-year',
        label: '1-year milestone',
        months: 12,
        reachedAt: '2021-01-15T12:00:00.000Z',
        ageYears: 1,
      },
      {
        id: 'five-years',
        label: '5-year milestone',
        months: 60,
        reachedAt: '2025-01-15T12:00:00.000Z',
        ageYears: 5,
      },
    ]);
  });

  it('does not report a milestone before its anniversary date', () => {
    expect(
      getReachedTreeMilestones('2025-01-15T12:00:00.000Z', new Date('2025-07-15T11:59:59.999Z'))
    ).toEqual([]);
  });

  it('returns no milestones for missing, invalid, or future planting dates', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    expect(getReachedTreeMilestones(undefined, now)).toEqual([]);
    expect(getReachedTreeMilestones('not-a-date', now)).toEqual([]);
    expect(getReachedTreeMilestones('2025-02-01T00:00:00.000Z', now)).toEqual([]);
  });

  it('clamps month anniversaries to the last valid day of shorter months', () => {
    expect(
      getReachedTreeMilestones('2024-08-31T00:00:00.000Z', new Date('2025-02-28T00:00:00.000Z'))[0]
        ?.reachedAt
    ).toBe('2025-02-28T00:00:00.000Z');
  });
});
