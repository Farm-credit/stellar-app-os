'use client';

import { CalendarDays, Clock, Globe, PlayCircle, UserRound, Users, Video } from 'lucide-react';
import {
  formatWebinarDate,
  formatWebinarTimeRange,
  getSeatAvailability,
  getWebinarTopic,
  type WebinarSession,
} from '@/lib/webinars';

export interface WebinarSessionCardProps {
  session: WebinarSession;
  /** Whether the session is still to come or has already been delivered. */
  status: 'upcoming' | 'past';
  /** Marks the soonest upcoming session. */
  isNext?: boolean;
}

/**
 * One row of the webinar series: schedule, topic, facilitator and the call to
 * action that matches the session state (register, waitlist, or watch the
 * recording).
 */
export function WebinarSessionCard({ session, status, isNext = false }: WebinarSessionCardProps) {
  const topic = getWebinarTopic(session.topicId);
  const seats = getSeatAvailability(session);
  const isUpcoming = status === 'upcoming';

  return (
    <article
      className={`rounded-2xl border bg-card p-6 shadow-sm ${
        isNext ? 'border-stellar-blue' : 'border-border'
      }`}
      aria-labelledby={`webinar-${session.slug}-title`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-stellar-blue/10 px-3 py-1 text-xs font-semibold text-stellar-blue">
          {topic.label}
        </span>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {session.level}
        </span>
        {isNext && (
          <span className="rounded-full bg-stellar-blue px-3 py-1 text-xs font-semibold text-white">
            Next session
          </span>
        )}
      </div>

      <h3
        id={`webinar-${session.slug}-title`}
        className="mt-4 text-xl font-semibold text-foreground"
      >
        {session.title}
      </h3>
      <p className="mt-2 leading-7 text-muted-foreground">{session.summary}</p>

      <dl className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <dt className="sr-only">Date</dt>
            <dd>
              <time dateTime={session.date}>{formatWebinarDate(session.date)}</time>
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <dt className="sr-only">Time</dt>
            <dd>
              {formatWebinarTimeRange(session)} ({session.durationMinutes} min)
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Globe className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <dt className="sr-only">Timezone</dt>
            <dd>{session.timeZone}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <dt className="sr-only">Facilitator</dt>
            <dd>{session.facilitator}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {isUpcoming ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              {seats.label}
            </p>
            {seats.isFull ? (
              <a
                href={session.registrationUrl}
                className="rounded-lg border border-stellar-blue px-4 py-2 text-sm font-semibold text-stellar-blue transition-colors hover:bg-stellar-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
              >
                Join the waitlist for {session.title}
              </a>
            ) : (
              <a
                href={session.registrationUrl}
                className="rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stellar-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
              >
                Register for {session.title}
              </a>
            )}
          </>
        ) : session.recordingUrl ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Video className="h-4 w-4" aria-hidden="true" />
              Session delivered
            </p>
            <a
              href={session.recordingUrl}
              className="flex items-center gap-2 rounded-lg border border-stellar-blue px-4 py-2 text-sm font-semibold text-stellar-blue transition-colors hover:bg-stellar-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              Watch the recording of {session.title}
            </a>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Video className="h-4 w-4" aria-hidden="true" />
              Session delivered
            </p>
            <p className="text-sm text-muted-foreground">Recording coming soon</p>
          </>
        )}
      </div>
    </article>
  );
}
