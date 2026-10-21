import { describe, expect, it } from 'vitest';
import { FIELD_TEAM_SLA_BUSINESS_DAYS, addBusinessDays } from '../business-days';

describe('addBusinessDays', () => {
  it('uses a 5 business day SLA', () => {
    expect(FIELD_TEAM_SLA_BUSINESS_DAYS).toBe(5);
  });

  it('adds five weekdays from a Monday to the next Monday', () => {
    // 2026-10-19 is a Monday
    const due = addBusinessDays(new Date('2026-10-19T09:30:00Z'), 5);
    expect(due.toISOString()).toBe('2026-10-26T09:30:00.000Z');
  });

  it('skips the weekend when counting from a Thursday', () => {
    const due = addBusinessDays(new Date('2026-10-22T12:00:00Z'), 5);
    expect(due.toISOString()).toBe('2026-10-29T12:00:00.000Z');
  });

  it('starts counting on the next business day for a Saturday message', () => {
    // Saturday 2026-10-24 → Mon 26, Tue 27, Wed 28, Thu 29, Fri 30
    const due = addBusinessDays(new Date('2026-10-24T10:00:00Z'), 5);
    expect(due.toISOString()).toBe('2026-10-30T10:00:00.000Z');
  });

  it('returns the same time for zero or negative days', () => {
    const start = new Date('2026-10-19T09:30:00Z');
    expect(addBusinessDays(start, 0).toISOString()).toBe(start.toISOString());
    expect(addBusinessDays(start, -2).toISOString()).toBe(start.toISOString());
  });

  it('does not change the date it was given', () => {
    const start = new Date('2026-10-19T09:30:00Z');
    addBusinessDays(start, 5);
    expect(start.toISOString()).toBe('2026-10-19T09:30:00.000Z');
  });
});
