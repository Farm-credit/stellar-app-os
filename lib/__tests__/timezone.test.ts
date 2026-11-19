import { describe, expect, it } from 'vitest';
import {
  DIGEST_HOUR,
  formatDateInTimeZone,
  getNextDigestTime,
  getTimeZoneOffsetLabel,
  groupTimeZones,
  isDigestDue,
  isValidTimeZone,
} from '../timezone';

describe('timezone utilities', () => {
  it('validates IANA timezone identifiers accurately', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Invalid/Timezone_Name')).toBe(false);
  });

  it('groups and sorts timezones by region prefix', () => {
    const grouped = groupTimeZones(['Europe/London', 'Africa/Lagos', 'UTC', 'Africa/Accra']);
    expect(grouped.map((g) => g.region)).toEqual(['Africa', 'Europe', 'General']);
    expect(grouped[0].zones).toEqual(['Africa/Accra', 'Africa/Lagos']);
  });

  it('computes UTC offset labels and formatted dates deterministically', () => {
    const sample = new Date('2024-03-12T09:00:00.000Z');
    expect(getTimeZoneOffsetLabel(sample, 'UTC')).toBe('UTC');
    expect(formatDateInTimeZone(sample, 'UTC')).toContain('2024');
  });

  it('calculates daily digest schedule and due window in sponsor timezone', () => {
    const beforeDigest = new Date('2024-03-12T08:00:00.000Z');
    const atDigest = new Date('2024-03-12T09:15:00.000Z');
    const next = getNextDigestTime('UTC', beforeDigest, DIGEST_HOUR);
    expect(next.toISOString()).toBe('2024-03-12T09:00:00.000Z');
    expect(isDigestDue('UTC', atDigest, DIGEST_HOUR)).toBe(true);
    expect(isDigestDue('UTC', beforeDigest, DIGEST_HOUR)).toBe(false);
  });
});
