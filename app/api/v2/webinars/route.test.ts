import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as LIST } from '@/app/api/v2/webinars/route';
import { POST as REGISTER } from '@/app/api/v2/webinars/[slug]/registrations/route';
import { GET as CALENDAR } from '@/app/api/v2/webinars/[slug]/calendar/route';
import { GET as PROGRESS } from '@/app/api/v2/webinars/progress/route';
import { resetWebinarRegistrations } from '@/lib/webinarRegistrations';

const BASE = 'http://localhost:3000/api/v2/webinars';

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function register(slug: string, body: unknown) {
  return REGISTER(
    new Request(`${BASE}/${slug}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params(slug)
  );
}

describe('/api/v2/webinars (#1419)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  });
  afterAll(() => vi.useRealTimers());
  beforeEach(() => resetWebinarRegistrations());

  it('lists upcoming and past sessions', async () => {
    const res = LIST(new Request(BASE));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.topics).toHaveLength(5);
    expect(data.upcoming[0].slug).toBe('compliance-requirements-overview');
    expect(data.past.length + data.upcoming.length).toBe(data.summary.total);
  });

  it('filters by topic and rejects unknown topics', async () => {
    const data = await LIST(new Request(`${BASE}?topic=soil-testing`)).json();
    expect(data.summary.total).toBe(2);

    expect(LIST(new Request(`${BASE}?topic=astrology`)).status).toBe(400);
  });

  it('registers a farmer and reflects the seat in the listing', async () => {
    const res = await register('market-trends-offtake-agreements', {
      name: 'Ada Obi',
      email: 'ada@farm.ng',
    });
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.registration.status).toBe('registered');

    const listing = await LIST(new Request(`${BASE}?q=offtake`)).json();
    expect(listing.upcoming[0].registered).toBe(89);
  });

  it('returns the right errors for bad registrations', async () => {
    expect(
      (await register('market-trends-offtake-agreements', { name: 'A', email: 'x' })).status
    ).toBe(400);
    expect((await register('missing', { name: 'Ada', email: 'ada@farm.ng' })).status).toBe(404);
    expect(
      (await register('soil-testing-sampling', { name: 'Ada', email: 'ada@farm.ng' })).status
    ).toBe(410);

    await register('compliance-audit-readiness', { name: 'Ada', email: 'ada@farm.ng' });
    expect(
      (await register('compliance-audit-readiness', { name: 'Ada', email: 'ada@farm.ng' })).status
    ).toBe(409);
  });

  it('serves an .ics calendar file', async () => {
    const res = await CALENDAR(
      new Request(`${BASE}/compliance-audit-readiness/calendar`),
      params('compliance-audit-readiness')
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(res.headers.get('Content-Disposition')).toContain('compliance-audit-readiness.ics');
    expect(await res.text()).toContain('DTSTART:20261210T130000Z');

    const missing = await CALENDAR(new Request(`${BASE}/nope/calendar`), params('nope'));
    expect(missing.status).toBe(404);
  });

  it('reports curriculum progress', async () => {
    const data = await PROGRESS(
      new Request(`${BASE}/progress?attended=soil-testing-sampling, market-trends-pricing`)
    ).json();
    expect(data.progress.completedTracks).toBe(2);
    expect(data.progress.certificateEligible).toBe(false);
  });
});
