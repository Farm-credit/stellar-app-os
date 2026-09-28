/**
 * Webinar registrations (v2) — Issue #1419
 *
 * In-memory registration store for the farmer training webinars. Seats are
 * counted on top of the published `registered` figure; once a session's
 * capacity is reached, new sign-ups join the waitlist instead of being
 * turned away.
 */

import {
  findWebinarSessionBySlug,
  getSeatAvailability,
  getWebinarStart,
  type SeatAvailability,
  type WebinarRegistrationInput,
  type WebinarSession,
} from '@/lib/webinars';

export type WebinarRegistrationStatus = 'registered' | 'waitlisted';

export interface WebinarRegistration extends WebinarRegistrationInput {
  id: string;
  slug: string;
  status: WebinarRegistrationStatus;
  createdAt: string;
}

export class WebinarRegistrationError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 410
  ) {
    super(message);
    this.name = 'WebinarRegistrationError';
  }
}

const registrations = new Map<string, WebinarRegistration[]>();

/** Session with its seat count including registrations taken through the app. */
export function withLiveSeats(session: WebinarSession): WebinarSession {
  const confirmed = (registrations.get(session.slug) ?? []).filter(
    (registration) => registration.status === 'registered'
  ).length;
  return { ...session, registered: session.registered + confirmed };
}

export function getRegistrations(slug: string): WebinarRegistration[] {
  return [...(registrations.get(slug) ?? [])];
}

/**
 * Register a farmer for an upcoming session. Returns a waitlist place when
 * the session is full.
 */
export function registerForWebinar(
  slug: string,
  input: WebinarRegistrationInput,
  now: Date = new Date()
): { registration: WebinarRegistration; seats: SeatAvailability } {
  const published = findWebinarSessionBySlug(slug);
  if (!published) throw new WebinarRegistrationError(`Webinar ${slug} not found`, 404);
  if (getWebinarStart(published).getTime() <= now.getTime()) {
    throw new WebinarRegistrationError('Registration has closed for this session', 410);
  }

  const existing = registrations.get(slug) ?? [];
  if (existing.some((registration) => registration.email === input.email)) {
    throw new WebinarRegistrationError('This email is already registered for the session', 409);
  }

  const before = getSeatAvailability(withLiveSeats(published));
  const registration: WebinarRegistration = {
    ...input,
    id: `webreg-${slug}-${existing.length + 1}`,
    slug,
    status: before.isFull ? 'waitlisted' : 'registered',
    createdAt: now.toISOString(),
  };
  registrations.set(slug, [...existing, registration]);

  return { registration, seats: getSeatAvailability(withLiveSeats(published)) };
}

/** Test helper: forget every registration. */
export function resetWebinarRegistrations(): void {
  registrations.clear();
}
