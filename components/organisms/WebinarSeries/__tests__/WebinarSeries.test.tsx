import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WebinarSeries } from '../WebinarSeries';
import { WEBINAR_SESSIONS, type WebinarSession } from '@/lib/webinars';

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
  registrationUrl: '/farmer-guides/webinars/carbon-accounting-foundations',
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
  registrationUrl: '/farmer-guides/webinars/market-trends-pricing',
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
  registrationUrl: '/farmer-guides/webinars/compliance-records',
});

const FIXTURES = [pastSession, upcomingSession, fullSession] as const;

describe('WebinarSeries', () => {
  it('renders the series heading, summary tiles and the next session banner', () => {
    render(<WebinarSeries sessions={FIXTURES} now={NOW} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Monthly webinars for healthier farms/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Sessions in series')).toBeInTheDocument();
    expect(screen.getByText('Topics covered')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next session' })).toBeInTheDocument();
    // Title appears in both the "next session" banner and its card.
    expect(screen.getAllByText('Reading carbon and commodity markets').length).toBeGreaterThan(1);
  });

  it('lists upcoming sessions with a registration link and a badge only on the next one', () => {
    render(<WebinarSeries sessions={FIXTURES} now={NOW} />);

    expect(
      screen.getByRole('link', {
        name: 'Register for Reading carbon and commodity markets',
      })
    ).toHaveAttribute('href', '/farmer-guides/webinars/market-trends-pricing');
    // Banner heading + the single "Next session" badge on the soonest card.
    expect(screen.getAllByText('Next session')).toHaveLength(2);
    expect(screen.getByText('2 of 40 seats left')).toBeInTheDocument();
  });

  it('offers the waitlist when an upcoming session is full', () => {
    render(<WebinarSeries sessions={FIXTURES} now={NOW} />);

    expect(screen.getByText('Full — join the waitlist')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Join the waitlist for Compliance: keeping audit-ready records',
      })
    ).toBeInTheDocument();
  });

  it('shows recordings for past sessions and a placeholder when none is published', () => {
    const { rerender } = render(<WebinarSeries sessions={[pastSession]} now={NOW} />);

    expect(
      screen.getByRole('link', {
        name: 'Watch the recording of Carbon accounting foundations',
      })
    ).toHaveAttribute('href', 'https://videos.example.org/farmable/carbon-accounting-foundations');

    rerender(
      <WebinarSeries
        sessions={[buildSession({ slug: 'no-recording', date: '2026-04-09', recordingUrl: null })]}
        now={NOW}
      />
    );
    expect(screen.getByText('Recording coming soon')).toBeInTheDocument();
  });

  it('exposes the session schedule as machine-readable time and human-readable text', () => {
    render(<WebinarSeries sessions={[upcomingSession]} now={NOW} />);

    const time = screen.getByText('9 Jul 2026');
    expect(time).toHaveAttribute('datetime', '2026-07-09');
    expect(screen.getByText('15:00–16:00 (60 min)')).toBeInTheDocument();
    expect(screen.getByText('Africa/Lagos')).toBeInTheDocument();
    // Facilitator renders once in the card (the banner joins it to the schedule).
    expect(screen.getByText('Tunde Okafor')).toBeInTheDocument();
  });

  it('filters both lists by topic and reports the filtered counts', () => {
    render(<WebinarSeries sessions={FIXTURES} now={NOW} />);

    expect(screen.getByRole('button', { name: 'All topics' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Compliance requirements' }));

    expect(screen.getByRole('button', { name: 'Compliance requirements' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText(/Showing 1 upcoming and 0 past session/)).toBeInTheDocument();
    // The filtered-out session's card and call to action are gone (the
    // unfiltered "next session" banner is a highlight and stays put).
    expect(
      screen.queryByRole('link', { name: 'Register for Reading carbon and commodity markets' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Compliance: keeping audit-ready records' })
    ).toBeInTheDocument();
  });

  it('filters by free text and shows an empty state when nothing matches', () => {
    render(<WebinarSeries sessions={FIXTURES} now={NOW} />);

    const search = screen.getByRole('searchbox', { name: 'Search webinars' });

    fireEvent.change(search, { target: { value: 'offtake' } });
    // Title shows in the banner and the matching card; the other card is gone.
    expect(screen.getAllByText('Reading carbon and commodity markets').length).toBeGreaterThan(0);
    expect(screen.queryByText('Carbon accounting foundations')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'rice paddies' } });
    expect(screen.getByText(/No upcoming sessions match your filters yet/i)).toBeInTheDocument();
  });

  it('renders an empty state for each list when there are no sessions', () => {
    render(<WebinarSeries sessions={[]} now={NOW} />);

    expect(screen.getByText(/No sessions have been delivered yet/i)).toBeInTheDocument();
    expect(screen.getByText(/The next season of sessions is being scheduled/i)).toBeInTheDocument();
    expect(screen.getByText('Open stream')).toBeInTheDocument();
  });

  it('defaults to the published curriculum schedule', () => {
    render(<WebinarSeries now={NOW} />);

    const summary = screen.getByText('Sessions in series').closest('div');
    expect(summary).not.toBeNull();
    expect(
      within(summary as HTMLElement).getByText(String(WEBINAR_SESSIONS.length))
    ).toBeInTheDocument();
    expect(screen.getAllByText('Upcoming sessions').length).toBeGreaterThan(0);
  });
});
