import { describe, expect, it } from 'vitest';
import {
  WEBINAR_SESSIONS,
  WEBINAR_TOPICS,
  filterWebinarSessions,
  findWebinarSessionBySlug,
  formatWebinarDate,
  formatWebinarSchedule,
  formatWebinarTimeRange,
  getPastWebinarSessions,
  getSeatAvailability,
  getUpcomingWebinarSessions,
  getWebinarStart,
  getWebinarTopic,
  summarizeWebinarSeries,
  type WebinarSession,
} from '@/lib/webinars';

/** Reference time for every upcoming/past assertion: 1 June 2026. */
const NOW = new Date('2026-06-01T00:00:00Z');

function buildSession(overrides: Partial<WebinarSession> = {}): WebinarSession {
  return {
    slug: 'soil-testing-sampling',
    title: 'Soil testing and sampling',
    summary: 'Collect representative samples and turn a lab report into a soil plan.',
    topicId: 'soil-testing',
    level: 'Practical',
    date: '2026-04-09',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Kwame Mensah',
    capacity: 40,
    registered: 10,
    registrationUrl: '/farmer-guides/webinars/soil-testing-sampling',
    recordingUrl: null,
    ...overrides,
  };
}

const pastSession = buildSession({
  slug: 'carbon-accounting-foundations',
  title: 'Carbon accounting foundations',
  topicId: 'carbon-accounting',
  summary: 'Set a reporting boundary and keep a defensible emissions ledger.',
  facilitator: 'Dr. Amina Bello',
  date: '2026-04-09',
  capacity: 120,
  registered: 40,
  recordingUrl: 'https://videos.example.org/farmable/carbon-accounting-foundations',
});

const upcomingSession = buildSession({
  slug: 'market-trends-pricing',
  title: 'Reading carbon and commodity markets',
  topicId: 'market-trends',
  summary: 'Where verified carbon prices come from and how buyers structure offtake.',
  facilitator: 'Tunde Okafor',
  date: '2026-07-09',
  capacity: 40,
  registered: 38,
});

const fullSession = buildSession({
  slug: 'compliance-records',
  title: 'Compliance: keeping audit-ready records',
  topicId: 'compliance',
  summary: 'The records a verifier will ask for and how long to keep them.',
  facilitator: 'Grace Nyambura',
  date: '2026-08-13',
  capacity: 30,
  registered: 30,
});

const FIXTURES = [pastSession, upcomingSession, fullSession] as const;

describe('webinar curriculum', () => {
  it('covers the five training tracks from the series brief', () => {
    expect(WEBINAR_TOPICS.map((topic) => topic.label)).toEqual([
      'Carbon accounting',
      'Soil testing',
      'Sustainable practices',
      'Market trends',
      'Compliance requirements',
    ]);
    expect(WEBINAR_TOPICS.every((topic) => topic.summary.length > 0)).toBe(true);
  });

  it('publishes a schedule with unique slugs covering every track', () => {
    const slugs = WEBINAR_SESSIONS.map((session) => session.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(WEBINAR_SESSIONS.length).toBeGreaterThanOrEqual(WEBINAR_TOPICS.length);
    for (const topic of WEBINAR_TOPICS) {
      expect(WEBINAR_SESSIONS.some((session) => session.topicId === topic.id)).toBe(true);
    }
  });

  it('keeps every published session coherent', () => {
    for (const session of WEBINAR_SESSIONS) {
      expect(Number.isFinite(getWebinarStart(session).getTime())).toBe(true);
      expect(session.durationMinutes).toBeGreaterThan(0);
      expect(session.registered).toBeLessThanOrEqual(session.capacity ?? Infinity);
      expect(getWebinarTopic(session.topicId).id).toBe(session.topicId);
    }
  });

  it('looks up topics and sessions, with safe fallbacks', () => {
    expect(getWebinarTopic('soil-testing').label).toBe('Soil testing');
    expect(getWebinarTopic('not-a-topic')).toBe(WEBINAR_TOPICS[0]);
    expect(findWebinarSessionBySlug('carbon-accounting-foundations')).toBeDefined();
    expect(findWebinarSessionBySlug('missing-slug')).toBeUndefined();
    expect(findWebinarSessionBySlug('compliance-records', FIXTURES)?.title).toBe(
      'Compliance: keeping audit-ready records',
    );
  });
});

describe('webinar schedule formatting', () => {
  it('resolves the session start instant in the published timezone', () => {
    // Africa/Lagos is UTC+1 all year, so a 15:00 session starts at 14:00 UTC.
    expect(
      getWebinarStart(buildSession({ date: '2026-02-12', startTime: '15:00' })).toISOString(),
    ).toBe('2026-02-12T14:00:00.000Z');
    expect(
      getWebinarStart(buildSession({ timeZone: 'UTC', startTime: '09:30' })).toISOString(),
    ).toBe('2026-04-09T09:30:00.000Z');
  });

  it('falls back to UTC for an unknown timezone instead of throwing', () => {
    expect(getWebinarStart(buildSession({ timeZone: 'Not/AZone' })).toISOString()).toBe(
      '2026-04-09T15:00:00.000Z',
    );
  });

  it('formats dates and time ranges deterministically', () => {
    expect(formatWebinarDate('2026-02-12')).toBe('12 Feb 2026');
    expect(formatWebinarDate('nonsense')).toBe('nonsense');
    expect(formatWebinarTimeRange({ startTime: '15:00', durationMinutes: 90 })).toBe('15:00–16:30');
    expect(formatWebinarTimeRange({ startTime: '23:30', durationMinutes: 90 })).toBe('23:30–01:00');
    expect(
      formatWebinarSchedule(
        buildSession({ date: '2026-07-09', startTime: '15:00', durationMinutes: 60 }),
      ),
    ).toBe('9 Jul 2026 · 15:00–16:00 (Africa/Lagos)');
  });
});

describe('getSeatAvailability', () => {
  it('reports remaining seats', () => {
    expect(getSeatAvailability({ capacity: 120, registered: 118 })).toEqual({
      remaining: 2,
      isFull: false,
      label: '2 of 120 seats left',
    });
  });

  it('marks a session full at zero seats and when oversubscribed', () => {
    expect(getSeatAvailability({ capacity: 30, registered: 30 })).toEqual({
      remaining: 0,
      isFull: true,
      label: 'Full — join the waitlist',
    });
    expect(getSeatAvailability({ capacity: 30, registered: 42 }).isFull).toBe(true);
  });

  it('treats an uncapped session as an open stream', () => {
    expect(getSeatAvailability({ capacity: null, registered: 500 })).toEqual({
      remaining: null,
      isFull: false,
      label: 'Open stream',
    });
  });
});

describe('upcoming and past splits', () => {
  it('splits the schedule around the reference time', () => {
    expect(getUpcomingWebinarSessions(FIXTURES, NOW).map((session) => session.slug)).toEqual([
      'market-trends-pricing',
      'compliance-records',
    ]);
    expect(getPastWebinarSessions(FIXTURES, NOW).map((session) => session.slug)).toEqual([
      'carbon-accounting-foundations',
    ]);
  });

  it('orders upcoming soonest-first and past most-recent-first', () => {
    const sessions = [
      buildSession({ slug: 'sep', date: '2026-09-10' }),
      buildSession({ slug: 'jul', date: '2026-07-09' }),
      buildSession({ slug: 'aug', date: '2026-08-13' }),
    ];

    expect(getUpcomingWebinarSessions(sessions, NOW).map((s) => s.slug)).toEqual([
      'jul',
      'aug',
      'sep',
    ]);
    expect(
      getPastWebinarSessions(sessions, new Date('2026-12-01T00:00:00Z')).map((s) => s.slug),
    ).toEqual(['sep', 'aug', 'jul']);
  });

  it('treats a session that has just started as past', () => {
    const session = buildSession({ date: '2026-04-09', startTime: '15:00' });

    expect(getUpcomingWebinarSessions([session], new Date('2026-04-09T13:59:00Z'))).toHaveLength(1);
    expect(getUpcomingWebinarSessions([session], new Date('2026-04-09T14:00:00Z'))).toHaveLength(0);
    expect(getPastWebinarSessions([session], new Date('2026-04-09T14:00:00Z'))).toHaveLength(1);
  });

  it('filters by topic and free text', () => {
    expect(filterWebinarSessions(FIXTURES, '', 'compliance').map((s) => s.slug)).toEqual([
      'compliance-records',
    ]);
    expect(filterWebinarSessions(FIXTURES, 'offtake').map((s) => s.slug)).toEqual([
      'market-trends-pricing',
    ]);
    expect(filterWebinarSessions(FIXTURES, 'Kwame').map((s) => s.slug)).toEqual([]);
    expect(filterWebinarSessions(FIXTURES, 'carbon accounting').map((s) => s.slug)).toEqual([
      'carbon-accounting-foundations',
    ]);
    expect(filterWebinarSessions(FIXTURES, '  ', 'all')).toHaveLength(FIXTURES.length);
  });
});

describe('summarizeWebinarSeries', () => {
  it('summarises the series against a reference time', () => {
    expect(summarizeWebinarSeries(FIXTURES, NOW)).toEqual({
      total: 3,
      upcoming: 2,
      past: 1,
      topicsCovered: 3,
      seatsRemaining: 2,
      nextSession: upcomingSession,
    });
  });

  it('reports an open stream when no upcoming session is capped', () => {
    const summary = summarizeWebinarSeries(
      [buildSession({ capacity: null, registered: 0, date: '2026-07-09' })],
      NOW,
    );

    expect(summary.seatsRemaining).toBeNull();
  });

  it('handles an empty series', () => {
    expect(summarizeWebinarSeries([], NOW)).toEqual({
      total: 0,
      upcoming: 0,
      past: 0,
      topicsCovered: 0,
      seatsRemaining: null,
      nextSession: null,
    });
  });
});
