import { beforeEach, describe, expect, it } from 'vitest';

import {
  REMINDER_LEAD_HOURS,
  buildPlantingCalendarIcs,
  escapeIcsText,
  foldIcsLine,
  getUpcomingPlantingEvents,
  isWithinReminderWindow,
  resetSentReminders,
  sendPlantingReminders,
} from '../plantingSchedule';
import { clearDigestEvents, getPendingDigestEvents } from '../notifications';
import { MOCK_BATCH_SPONSORSHIPS, MOCK_PLANTING_EVENTS } from '../treePlantingStreams';

const NOW = new Date('2026-10-21T09:00:00Z');
/** 51h before the north batch (2026-10-24T12:00Z): inside the 72h window. */
const REMIND_NOW = new Date('2026-10-22T09:00:00Z');

describe('getUpcomingPlantingEvents', () => {
  it('returns scheduled/live events soonest first and excludes ended ones', () => {
    const upcoming = getUpcomingPlantingEvents('proj-001', NOW);
    expect(upcoming.map((e) => e.id)).toEqual(['evt-proj-001-2026-10', 'evt-proj-001-2026-11']);
  });

  it('returns an empty list for projects without events', () => {
    expect(getUpcomingPlantingEvents('proj-999', NOW)).toEqual([]);
  });
});

describe('iCal output', () => {
  const events = getUpcomingPlantingEvents('proj-001', NOW);
  const ics = buildPlantingCalendarIcs('proj-001', events, NOW);
  const unfolded = ics.replace(/\r\n /g, '');

  it('is a well-formed calendar with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(events.length);
  });

  it('uses stable UIDs and UTC start/end times', () => {
    expect(ics).toContain('UID:evt-proj-001-2026-10@farmcredit.app');
    expect(ics).toContain('DTSTART:20261024T120000Z');
    expect(ics).toContain('DTEND:20261024T160000Z');
  });

  it('includes batch and estimated species in the description', () => {
    expect(unfolded).toContain('Batch: batch-proj-001-north-42');
    expect(unfolded).toContain('Estimated species: Brazil nut\\, Açaí palm\\, Cecropia');
  });

  it('keeps every physical line within 75 octets', () => {
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('escapes special characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines with a leading space', () => {
    const folded = foldIcsLine('X:' + 'a'.repeat(200));
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
  });
});

describe('sponsor reminders', () => {
  beforeEach(() => {
    resetSentReminders();
    for (const id of ['sponsor-101', 'sponsor-202', 'sponsor-303', 'sponsor-404']) {
      clearDigestEvents(id);
    }
  });

  const north = MOCK_PLANTING_EVENTS.find((e) => e.id === 'evt-proj-001-2026-10')!;

  it('only reminds inside the lead window', () => {
    expect(isWithinReminderWindow(north, REMIND_NOW)).toBe(true);
  });

  it('does not remind before the window or after the event', () => {
    const early = new Date(
      new Date(north.scheduledAt).getTime() - (REMINDER_LEAD_HOURS + 1) * 3600 * 1000
    );
    const late = new Date(new Date(north.scheduledAt).getTime() + 1000);
    expect(isWithinReminderWindow(north, early)).toBe(false);
    expect(isWithinReminderWindow(north, late)).toBe(false);
  });

  it('reminds only sponsors whose trees are in the batch', () => {
    const reminded = sendPlantingReminders(MOCK_PLANTING_EVENTS, MOCK_BATCH_SPONSORSHIPS, REMIND_NOW);
    const ids = reminded.map((r) => r.sponsorId).sort();
    expect(ids).toEqual(['sponsor-101', 'sponsor-202']);
    expect(getPendingDigestEvents('sponsor-303')).toHaveLength(0);
    expect(getPendingDigestEvents('sponsor-202')[0].description).toContain('1 of your tree is');
  });

  it('never reminds the same sponsor twice for an event', () => {
    sendPlantingReminders(MOCK_PLANTING_EVENTS, MOCK_BATCH_SPONSORSHIPS, REMIND_NOW);
    const second = sendPlantingReminders(MOCK_PLANTING_EVENTS, MOCK_BATCH_SPONSORSHIPS, REMIND_NOW);
    expect(second).toEqual([]);
    expect(getPendingDigestEvents('sponsor-101')).toHaveLength(1);
  });
});
