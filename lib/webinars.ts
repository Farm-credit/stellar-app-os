/**
 * Educational webinar series — farmer training (v1).
 *
 * The monthly farmer training curriculum and its published schedule. Like
 * `lib/faq.ts` and the farmer guide library, the content lives in a plain data
 * module so the schedule can be updated in one place without touching the UI,
 * and so the series can be rendered or filtered deterministically in tests.
 *
 * Every helper that depends on "today" accepts an explicit `now` argument
 * instead of reading the clock, so upcoming/past splits never depend on when
 * the test or the page happens to run.
 */

/** The five training tracks covered by the v1 curriculum. */
export const WEBINAR_TOPICS = [
  {
    id: 'carbon-accounting',
    label: 'Carbon accounting',
    summary: 'Measure farm emissions and removals so every credit claim is backed by records.',
  },
  {
    id: 'soil-testing',
    label: 'Soil testing',
    summary: 'Take representative samples and turn a lab report into an affordable soil plan.',
  },
  {
    id: 'sustainable-practices',
    label: 'Sustainable practices',
    summary: 'Keep ground cover, cut disturbance, and diversify rotations without losing yield.',
  },
  {
    id: 'market-trends',
    label: 'Market trends',
    summary: 'Read carbon and commodity prices, and time sales rather than reacting to them.',
  },
  {
    id: 'compliance',
    label: 'Compliance requirements',
    summary: 'Meet verification, record-keeping, and certification requirements before the audit.',
  },
] as const;

export type WebinarTopicId = (typeof WEBINAR_TOPICS)[number]['id'];

export type WebinarTopic = (typeof WEBINAR_TOPICS)[number];

/** Depth of a session: an introduction or a hands-on working session. */
export type WebinarLevel = 'Starter' | 'Practical';

export interface WebinarSession {
  slug: string;
  title: string;
  summary: string;
  topicId: WebinarTopicId;
  level: WebinarLevel;
  /** Session date as an ISO `YYYY-MM-DD` string (interpreted as UTC). */
  date: string;
  /** Start time as `HH:MM` (24-hour) in `timeZone`. */
  startTime: string;
  durationMinutes: number;
  /** IANA timezone the start time is expressed in. */
  timeZone: string;
  facilitator: string;
  /** Total seats in the room; `null` for an open stream with no seat cap. */
  capacity: number | null;
  /** Seats already taken. */
  registered: number;
  /** Registration link for upcoming sessions. */
  registrationUrl: string;
  /** Recording link, once a past session's recording is published. */
  recordingUrl: string | null;
}

/** Seat state for a session, derived from `capacity`/`registered`. */
export interface SeatAvailability {
  /** Seats left, or `null` when the session has no seat cap. */
  remaining: number | null;
  /** True when there is a seat cap and no seats are left. */
  isFull: boolean;
  /** Human-readable summary used by the card badge. */
  label: string;
}

/**
 * Published schedule (v1). One session per month, cycling through the five
 * curriculum tracks so each topic runs twice a year.
 */
export const WEBINAR_SESSIONS: readonly WebinarSession[] = [
  {
    slug: 'carbon-accounting-foundations',
    title: 'Carbon accounting foundations',
    summary:
      'Set a reporting boundary, record fuel, fertilizer, livestock and land-area data, and keep estimated reductions separate from verified removals.',
    topicId: 'carbon-accounting',
    level: 'Starter',
    date: '2026-02-12',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Dr. Amina Bello',
    capacity: 120,
    registered: 118,
    registrationUrl: '/farmer-guides/webinars/carbon-accounting-foundations',
    recordingUrl: 'https://videos.example.org/farmable/carbon-accounting-foundations',
  },
  {
    slug: 'soil-testing-sampling',
    title: 'Soil testing and sampling',
    summary:
      'Divide fields into management zones, take composite cores at a consistent depth, and choose the lab panel that matches your budget.',
    topicId: 'soil-testing',
    level: 'Practical',
    date: '2026-03-12',
    startTime: '14:00',
    durationMinutes: 90,
    timeZone: 'Africa/Lagos',
    facilitator: 'Kwame Mensah',
    capacity: 80,
    registered: 80,
    registrationUrl: '/farmer-guides/webinars/soil-testing-sampling',
    recordingUrl: 'https://videos.example.org/farmable/soil-testing-sampling',
  },
  {
    slug: 'sustainable-practices-in-practice',
    title: 'Sustainable practices in practice',
    summary:
      'Cover crops, residue management, and low-disturbance planting sequenced into one season, with the trade-offs of each change spelled out.',
    topicId: 'sustainable-practices',
    level: 'Starter',
    date: '2026-04-09',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Aisha Lawal',
    capacity: 150,
    registered: 96,
    registrationUrl: '/farmer-guides/webinars/sustainable-practices-in-practice',
    recordingUrl: 'https://videos.example.org/farmable/sustainable-practices-in-practice',
  },
  {
    slug: 'market-trends-pricing',
    title: 'Reading carbon and commodity markets',
    summary:
      'Where verified carbon prices come from, how buyers structure offtake agreements, and how to plan sales around them.',
    topicId: 'market-trends',
    level: 'Practical',
    date: '2026-05-14',
    startTime: '16:00',
    durationMinutes: 90,
    timeZone: 'Africa/Lagos',
    facilitator: 'Tunde Okafor',
    capacity: 90,
    registered: 74,
    registrationUrl: '/farmer-guides/webinars/market-trends-pricing',
    recordingUrl: null,
  },
  {
    slug: 'compliance-requirements-overview',
    title: 'Compliance requirements overview',
    summary:
      'The records a verifier will ask for, how long to keep them, and the deadlines that apply to certification and credit issuance.',
    topicId: 'compliance',
    level: 'Starter',
    date: '2026-06-11',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Grace Nyambura',
    capacity: 200,
    registered: 163,
    registrationUrl: '/farmer-guides/webinars/compliance-requirements-overview',
    recordingUrl: 'https://videos.example.org/farmable/compliance-requirements-overview',
  },
  {
    slug: 'carbon-accounting-record-keeping',
    title: 'Carbon accounting: record-keeping clinic',
    summary:
      'Bring one season of farm records and leave with a validated emissions and sequestration ledger ready for verification.',
    topicId: 'carbon-accounting',
    level: 'Practical',
    date: '2026-08-13',
    startTime: '14:00',
    durationMinutes: 90,
    timeZone: 'Africa/Lagos',
    facilitator: 'Dr. Amina Bello',
    capacity: 60,
    registered: 52,
    registrationUrl: '/farmer-guides/webinars/carbon-accounting-record-keeping',
    recordingUrl: null,
  },
  {
    slug: 'soil-testing-fertility-plan',
    title: 'Soil testing: building the fertility plan',
    summary:
      'Turn a lab report into an amendment plan you can afford this season, then retest on a schedule you can keep.',
    topicId: 'soil-testing',
    level: 'Starter',
    date: '2026-09-10',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Kwame Mensah',
    capacity: 120,
    registered: 67,
    registrationUrl: '/farmer-guides/webinars/soil-testing-fertility-plan',
    recordingUrl: null,
  },
  {
    slug: 'sustainable-practices-water-soil',
    title: 'Sustainable practices: water and soil retention',
    summary:
      'Which cover mixes and contour treatments keep water on the field through a dry spell, and how to tell whether they worked.',
    topicId: 'sustainable-practices',
    level: 'Practical',
    date: '2026-10-08',
    startTime: '14:00',
    durationMinutes: 90,
    timeZone: 'Africa/Lagos',
    facilitator: 'Aisha Lawal',
    capacity: 80,
    registered: 41,
    registrationUrl: '/farmer-guides/webinars/sustainable-practices-water-soil',
    recordingUrl: null,
  },
  {
    slug: 'market-trends-offtake-agreements',
    title: 'Market trends: offtake agreements',
    summary:
      'Walk through a sample offtake term sheet line by line: volume, price floor, verification clause, and termination.',
    topicId: 'market-trends',
    level: 'Starter',
    date: '2026-11-12',
    startTime: '15:00',
    durationMinutes: 60,
    timeZone: 'Africa/Lagos',
    facilitator: 'Tunde Okafor',
    capacity: 150,
    registered: 88,
    registrationUrl: '/farmer-guides/webinars/market-trends-offtake-agreements',
    recordingUrl: null,
  },
  {
    slug: 'compliance-audit-readiness',
    title: 'Compliance: audit readiness',
    summary:
      'A dry run of the verification interview, including the evidence file, sample photos, and chain-of-custody records.',
    topicId: 'compliance',
    level: 'Practical',
    date: '2026-12-10',
    startTime: '14:00',
    durationMinutes: 90,
    timeZone: 'Africa/Lagos',
    facilitator: 'Grace Nyambura',
    capacity: 60,
    registered: 33,
    registrationUrl: '/farmer-guides/webinars/compliance-audit-readiness',
    recordingUrl: null,
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────────

/** Look up a curriculum topic, falling back to the first track. */
export function getWebinarTopic(id: WebinarTopicId | string): WebinarTopic {
  return WEBINAR_TOPICS.find((topic) => topic.id === id) ?? WEBINAR_TOPICS[0];
}

/** Find a session by slug, or `undefined` when it is not in the series. */
export function findWebinarSessionBySlug(
  slug: string,
  sessions: readonly WebinarSession[] = WEBINAR_SESSIONS
): WebinarSession | undefined {
  return sessions.find((session) => session.slug === slug);
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/**
 * Parse a session date/time into a `Date`.
 *
 * Sessions are published as `YYYY-MM-DD` + `HH:MM` in `timeZone`; the returned
 * instant is exact for UTC and for zones that never observe daylight saving
 * (the zones used by the series), and is the correct instant everywhere else
 * once the offset is known.
 */
export function getWebinarStart(
  session: Pick<WebinarSession, 'date' | 'startTime' | 'timeZone'>
): Date {
  const offsetMinutes = timeZoneOffsetMinutes(session.timeZone, session.date);
  const asUtc = Date.parse(`${session.date}T${session.startTime}:00Z`);
  return new Date(asUtc - offsetMinutes * 60_000);
}

/**
 * Offset of `timeZone` from UTC at `date`, in minutes, using `Intl` so no
 * timezone database is bundled. Unknown zones fall back to UTC.
 */
function timeZoneOffsetMinutes(timeZone: string, date: string): number {
  try {
    const utcMidnight = Date.parse(`${date}T00:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(utcMidnight));
    const asUtc = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');
    const zoned = Date.UTC(
      asUtc('year'),
      asUtc('month') - 1,
      asUtc('day'),
      asUtc('hour') % 24,
      asUtc('minute')
    );
    return (zoned - utcMidnight) / 60_000;
  } catch {
    return 0;
  }
}

/** Format a session date, e.g. `12 Feb 2026`, stable regardless of host timezone. */
export function formatWebinarDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return date;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(parsed));
}

/** Format the start and end clock times, e.g. `15:00–16:30`. */
export function formatWebinarTimeRange(
  session: Pick<WebinarSession, 'startTime' | 'durationMinutes'>
): string {
  const [hours, minutes] = session.startTime.split(':').map(Number);
  const start = (hours || 0) * 60 + (minutes || 0);
  const end = start + Math.max(0, session.durationMinutes);
  const render = (total: number): string =>
    `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return `${render(start)}–${render(end)}`;
}

/** Full one-line schedule, e.g. `12 Feb 2026 · 15:00–16:30 (Africa/Lagos)`. */
export function formatWebinarSchedule(session: WebinarSession): string {
  return `${formatWebinarDate(session.date)} · ${formatWebinarTimeRange(session)} (${session.timeZone})`;
}

// ── Seat availability ─────────────────────────────────────────────────────────

/** Seats left, full/waitlist state, and the label shown on the session badge. */
export function getSeatAvailability(
  session: Pick<WebinarSession, 'capacity' | 'registered'>
): SeatAvailability {
  if (session.capacity === null) {
    return { remaining: null, isFull: false, label: 'Open stream' };
  }

  const remaining = Math.max(0, session.capacity - Math.max(0, session.registered));
  if (remaining === 0) {
    return { remaining: 0, isFull: true, label: 'Full — join the waitlist' };
  }
  return {
    remaining,
    isFull: false,
    label: `${remaining} of ${session.capacity} seats left`,
  };
}

// ── Upcoming / past splits and filtering ──────────────────────────────────────

/** Sessions that have not started yet, soonest first. */
export function getUpcomingWebinarSessions(
  sessions: readonly WebinarSession[] = WEBINAR_SESSIONS,
  now: Date = new Date()
): WebinarSession[] {
  return sessions
    .filter((session) => getWebinarStart(session).getTime() > now.getTime())
    .sort((a, b) => getWebinarStart(a).getTime() - getWebinarStart(b).getTime());
}

/** Sessions that have already started, most recent first. */
export function getPastWebinarSessions(
  sessions: readonly WebinarSession[] = WEBINAR_SESSIONS,
  now: Date = new Date()
): WebinarSession[] {
  return sessions
    .filter((session) => getWebinarStart(session).getTime() <= now.getTime())
    .sort((a, b) => getWebinarStart(b).getTime() - getWebinarStart(a).getTime());
}

/**
 * Filter the series by a free-text query (title, summary, facilitator or topic
 * label) and an optional topic id. `'all'` and an empty query are both no-ops.
 */
export function filterWebinarSessions(
  sessions: readonly WebinarSession[],
  query = '',
  topicId: WebinarTopicId | 'all' = 'all'
): WebinarSession[] {
  const needle = query.trim().toLowerCase();
  return sessions.filter((session) => {
    if (topicId !== 'all' && session.topicId !== topicId) return false;
    if (!needle) return true;
    const haystack = [
      session.title,
      session.summary,
      session.facilitator,
      getWebinarTopic(session.topicId).label,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export interface WebinarSeriesSummary {
  /** Sessions in the series. */
  total: number;
  /** Sessions still to come. */
  upcoming: number;
  /** Sessions already delivered. */
  past: number;
  /** Distinct curriculum tracks covered. */
  topicsCovered: number;
  /** Seats left across upcoming sessions, or `null` when none are capped. */
  seatsRemaining: number | null;
  /** The soonest upcoming session, or `null` when the series has finished. */
  nextSession: WebinarSession | null;
}

/** Headline numbers for the series, used by the page summary tiles. */
export function summarizeWebinarSeries(
  sessions: readonly WebinarSession[] = WEBINAR_SESSIONS,
  now: Date = new Date()
): WebinarSeriesSummary {
  const upcoming = getUpcomingWebinarSessions(sessions, now);
  const past = getPastWebinarSessions(sessions, now);
  const capped = upcoming.filter((session) => session.capacity !== null);

  return {
    total: sessions.length,
    upcoming: upcoming.length,
    past: past.length,
    topicsCovered: new Set(sessions.map((session) => session.topicId)).size,
    seatsRemaining: capped.length
      ? capped.reduce((sum, session) => sum + (getSeatAvailability(session).remaining ?? 0), 0)
      : null,
    nextSession: upcoming[0] ?? null,
  };
}

// ── v2: calendar export, registration and curriculum progress (#1419) ────────

/** When a session ends, derived from its start and duration. */
export function getWebinarEnd(
  session: Pick<WebinarSession, 'date' | 'startTime' | 'timeZone' | 'durationMinutes'>
): Date {
  return new Date(
    getWebinarStart(session).getTime() + Math.max(0, session.durationMinutes) * 60_000
  );
}

function icsTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * An RFC 5545 calendar file for one session, so farmers can add it to any
 * phone or desktop calendar. Times are written in UTC so no timezone
 * definitions need to be embedded.
 */
export function buildWebinarIcs(
  session: WebinarSession,
  options: { siteUrl?: string; now?: Date } = {}
): string {
  const siteUrl = (options.siteUrl ?? '').replace(/\/$/, '');
  const topic = getWebinarTopic(session.topicId);
  const description = `${session.summary}\n\nTrack: ${topic.label}\nFacilitator: ${session.facilitator}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Farm Credit//Farmer Training Webinars//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${session.slug}@webinars.farmcredit`,
    `DTSTAMP:${icsTimestamp(options.now ?? new Date())}`,
    `DTSTART:${icsTimestamp(getWebinarStart(session))}`,
    `DTEND:${icsTimestamp(getWebinarEnd(session))}`,
    `SUMMARY:${icsEscape(session.title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${siteUrl}${session.registrationUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export interface WebinarRegistrationInput {
  name: string;
  email: string;
  /** Optional farm location, used to plan regional follow-up sessions. */
  location?: string;
}

export type WebinarRegistrationValidation =
  { ok: true; data: WebinarRegistrationInput } | { ok: false; errors: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate and normalize a registration form submission. */
export function validateWebinarRegistration(raw: unknown): WebinarRegistrationValidation {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const errors: string[] = [];

  if (name.length < 2 || name.length > 100) errors.push('Enter your name (2–100 characters).');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.push('Enter a valid email address.');
  if (location.length > 120) errors.push('Location must be 120 characters or fewer.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { name, email, ...(location ? { location } : {}) } };
}

export interface CurriculumTrackProgress {
  topic: WebinarTopic;
  /** Whether the farmer attended at least one session in this track. */
  completed: boolean;
  /** Slugs of the sessions attended in this track. */
  attended: string[];
}

export interface CurriculumProgress {
  tracks: CurriculumTrackProgress[];
  completedTracks: number;
  totalTracks: number;
  percentComplete: number;
  /** A training certificate is issued once every track has been attended. */
  certificateEligible: boolean;
  /** Soonest upcoming session in a track still to complete, if any. */
  nextRecommended: WebinarSession | null;
}

/**
 * Progress through the five-track curriculum from the sessions a farmer has
 * attended. Unknown slugs are ignored.
 */
export function getCurriculumProgress(
  attendedSlugs: readonly string[],
  sessions: readonly WebinarSession[] = WEBINAR_SESSIONS,
  now: Date = new Date()
): CurriculumProgress {
  const attended = new Set(attendedSlugs);
  const tracks = WEBINAR_TOPICS.map((topic) => {
    const attendedInTrack = sessions
      .filter((session) => session.topicId === topic.id && attended.has(session.slug))
      .map((session) => session.slug);
    return { topic, completed: attendedInTrack.length > 0, attended: attendedInTrack };
  });

  const remaining = new Set(
    tracks.filter((track) => !track.completed).map((track) => track.topic.id)
  );
  const completedTracks = tracks.length - remaining.size;

  return {
    tracks,
    completedTracks,
    totalTracks: tracks.length,
    percentComplete: Math.round((completedTracks / tracks.length) * 100),
    certificateEligible: remaining.size === 0,
    nextRecommended:
      getUpcomingWebinarSessions(sessions, now).find((session) => remaining.has(session.topicId)) ??
      null,
  };
}
