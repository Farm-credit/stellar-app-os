import { beforeEach, describe, expect, it } from 'vitest';
import {
  WEBINAR_SESSIONS,
  buildWebinarIcs,
  findWebinarSessionBySlug,
  getCurriculumProgress,
  getWebinarEnd,
  getWebinarStart,
  validateWebinarRegistration,
  type WebinarSession,
} from '@/lib/webinars';
import {
  WebinarRegistrationError,
  getRegistrations,
  registerForWebinar,
  resetWebinarRegistrations,
  withLiveSeats,
} from '@/lib/webinarRegistrations';

/** Reference time: 1 June 2026, before every H2 2026 session. */
const NOW = new Date('2026-06-01T00:00:00Z');

function session(slug: string): WebinarSession {
  const found = findWebinarSessionBySlug(slug);
  if (!found) throw new Error(`missing fixture ${slug}`);
  return found;
}

describe('getWebinarEnd (#1419)', () => {
  it('adds the duration to the start', () => {
    const soil = session('soil-testing-sampling');
    expect(getWebinarEnd(soil).getTime() - getWebinarStart(soil).getTime()).toBe(90 * 60_000);
  });
});

describe('buildWebinarIcs (#1419)', () => {
  const ics = buildWebinarIcs(session('market-trends-offtake-agreements'), {
    siteUrl: 'https://farm.example/',
    now: NOW,
  });

  it('produces a CRLF-delimited VEVENT with UTC times', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nBEGIN:VEVENT\r\n');
    // 15:00 Africa/Lagos (UTC+1) on 12 Nov 2026 → 14:00Z, for 60 minutes.
    expect(ics).toContain('DTSTART:20261112T140000Z');
    expect(ics).toContain('DTEND:20261112T150000Z');
    expect(ics).toContain('DTSTAMP:20260601T000000Z');
    expect(ics).toContain('UID:market-trends-offtake-agreements@webinars.farmcredit');
  });

  it('links back to the session page and escapes text', () => {
    expect(ics).toContain(
      'URL:https://farm.example/farmer-guides/webinars/market-trends-offtake-agreements'
    );
    expect(ics).toContain('SUMMARY:Market trends: offtake agreements');
    // Commas in the summary and the line break before the track are escaped.
    expect(ics).toMatch(/DESCRIPTION:.*volume\\, price floor.*\\n\\nTrack: Market trends/);
  });
});

describe('validateWebinarRegistration (#1419)', () => {
  it('normalizes a valid submission', () => {
    expect(
      validateWebinarRegistration({ name: '  Ada Obi ', email: 'Ada@Farm.NG ', location: '' })
    ).toEqual({ ok: true, data: { name: 'Ada Obi', email: 'ada@farm.ng' } });
  });

  it('keeps an optional location', () => {
    const result = validateWebinarRegistration({ name: 'Ada', email: 'a@b.co', location: 'Kano' });
    expect(result.ok && result.data.location).toBe('Kano');
  });

  it('reports invalid name and email', () => {
    const result = validateWebinarRegistration({ name: 'A', email: 'not-an-email' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it('rejects a missing body', () => {
    expect(validateWebinarRegistration(null).ok).toBe(false);
  });
});

describe('getCurriculumProgress (#1419)', () => {
  it('starts at zero and recommends the soonest upcoming session', () => {
    const progress = getCurriculumProgress([], WEBINAR_SESSIONS, NOW);
    expect(progress.completedTracks).toBe(0);
    expect(progress.totalTracks).toBe(5);
    expect(progress.certificateEligible).toBe(false);
    expect(progress.nextRecommended?.slug).toBe('compliance-requirements-overview');
  });

  it('counts a track once however many of its sessions were attended', () => {
    const progress = getCurriculumProgress(
      ['carbon-accounting-foundations', 'carbon-accounting-record-keeping', 'unknown-slug'],
      WEBINAR_SESSIONS,
      NOW
    );
    expect(progress.completedTracks).toBe(1);
    expect(progress.percentComplete).toBe(20);
    expect(progress.tracks[0].attended).toEqual([
      'carbon-accounting-foundations',
      'carbon-accounting-record-keeping',
    ]);
  });

  it('skips tracks already completed when recommending the next session', () => {
    const progress = getCurriculumProgress(
      ['compliance-requirements-overview'],
      WEBINAR_SESSIONS,
      NOW
    );
    expect(progress.nextRecommended?.topicId).not.toBe('compliance');
  });

  it('makes the farmer certificate-eligible after every track', () => {
    const progress = getCurriculumProgress(
      [
        'carbon-accounting-foundations',
        'soil-testing-sampling',
        'sustainable-practices-in-practice',
        'market-trends-pricing',
        'compliance-requirements-overview',
      ],
      WEBINAR_SESSIONS,
      NOW
    );
    expect(progress.percentComplete).toBe(100);
    expect(progress.certificateEligible).toBe(true);
    expect(progress.nextRecommended).toBeNull();
  });
});

describe('registerForWebinar (#1419)', () => {
  beforeEach(() => resetWebinarRegistrations());

  it('takes a seat and updates the live count', () => {
    const slug = 'soil-testing-fertility-plan';
    const before = withLiveSeats(session(slug)).registered;

    const { registration, seats } = registerForWebinar(
      slug,
      { name: 'Ada', email: 'ada@farm.ng' },
      NOW
    );

    expect(registration.status).toBe('registered');
    expect(withLiveSeats(session(slug)).registered).toBe(before + 1);
    expect(seats.remaining).toBe(120 - (before + 1));
    expect(getRegistrations(slug)).toHaveLength(1);
  });

  it('waitlists sign-ups once the session is full', () => {
    // 60 seats, 52 taken: eight more fill it.
    const slug = 'carbon-accounting-record-keeping';
    for (let i = 0; i < 8; i += 1) {
      expect(
        registerForWebinar(slug, { name: `Farmer ${i}`, email: `f${i}@farm.ng` }, NOW).registration
          .status
      ).toBe('registered');
    }
    const late = registerForWebinar(slug, { name: 'Late', email: 'late@farm.ng' }, NOW);
    expect(late.registration.status).toBe('waitlisted');
    expect(late.seats.isFull).toBe(true);
    expect(withLiveSeats(session(slug)).registered).toBe(60);
  });

  it('rejects duplicate emails, unknown sessions and sessions that have started', () => {
    const slug = 'compliance-audit-readiness';
    registerForWebinar(slug, { name: 'Ada', email: 'ada@farm.ng' }, NOW);

    const statusOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        expect(error).toBeInstanceOf(WebinarRegistrationError);
        return (error as WebinarRegistrationError).status;
      }
      return null;
    };

    expect(
      statusOf(() => registerForWebinar(slug, { name: 'Ada', email: 'ada@farm.ng' }, NOW))
    ).toBe(409);
    expect(statusOf(() => registerForWebinar('nope', { name: 'Ada', email: 'a@b.co' }, NOW))).toBe(
      404
    );
    expect(
      statusOf(() =>
        registerForWebinar('soil-testing-sampling', { name: 'Ada', email: 'a@b.co' }, NOW)
      )
    ).toBe(410);
  });
});
