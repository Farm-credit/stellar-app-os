'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { GraduationCap, Search } from 'lucide-react';
import {
  WEBINAR_SESSIONS,
  WEBINAR_TOPICS,
  filterWebinarSessions,
  formatWebinarSchedule,
  getPastWebinarSessions,
  getUpcomingWebinarSessions,
  summarizeWebinarSeries,
  type WebinarSession,
  type WebinarTopicId,
} from '@/lib/webinars';
import { WebinarSessionCard } from './WebinarSessionCard';

export interface WebinarSeriesProps {
  /**
   * Optional sessions. When omitted the published curriculum schedule is used
   * (the prop exists so the page, tests and previews can render a fixed set).
   */
  sessions?: readonly WebinarSession[];
  /** Reference time used to split upcoming from past. Defaults to now. */
  now?: Date;
}

const HEADING_ID = 'farmer-webinar-series-heading';
const ALL_TOPICS = 'all' as const;

function TopicChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue ${
        active
          ? 'border-stellar-blue bg-stellar-blue text-white'
          : 'border-border bg-card text-foreground hover:border-stellar-blue hover:text-stellar-blue'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground"
    >
      {children}
    </p>
  );
}

/**
 * The monthly farmer training webinar series: the curriculum tracks, the
 * published schedule, and the sessions split into upcoming and past.
 *
 * The series is static content (v1) — there is no registration backend yet, so
 * every call to action links to the session page rather than POSTing anywhere.
 */
export function WebinarSeries({ sessions = WEBINAR_SESSIONS, now }: WebinarSeriesProps) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<WebinarTopicId | typeof ALL_TOPICS>(ALL_TOPICS);

  const summary = useMemo(() => summarizeWebinarSeries(sessions, now), [sessions, now]);

  const matching = useMemo(
    () => filterWebinarSessions(sessions, query, topic),
    [sessions, query, topic]
  );
  const upcoming = useMemo(() => getUpcomingWebinarSessions(matching, now), [matching, now]);
  const past = useMemo(() => getPastWebinarSessions(matching, now), [matching, now]);

  const nextSession = summary.nextSession;
  const hasFilters = query.trim().length > 0 || topic !== ALL_TOPICS;

  return (
    <section aria-labelledby={HEADING_ID} className="mx-auto max-w-6xl">
      <div className="max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
          Farmer training webinars
        </p>
        <h1
          id={HEADING_ID}
          className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
        >
          Monthly webinars for healthier farms and better records
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          A free session every month on carbon accounting, soil testing, sustainable practices,
          market trends and compliance requirements. Sessions are practical: bring your farm
          records, leave with something you can act on this season.
        </p>
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryTile label="Sessions in series" value={String(summary.total)} />
        <SummaryTile label="Upcoming" value={String(summary.upcoming)} />
        <SummaryTile label="Topics covered" value={String(summary.topicsCovered)} />
        <SummaryTile
          label="Seats left"
          value={summary.seatsRemaining === null ? 'Open stream' : String(summary.seatsRemaining)}
        />
      </dl>

      {nextSession && (
        <div className="mt-6 rounded-2xl border border-stellar-blue/40 bg-stellar-blue/5 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stellar-blue">
            Next session
          </h2>
          <p className="mt-2 text-lg font-semibold text-foreground">{nextSession.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatWebinarSchedule(nextSession)} · {nextSession.facilitator}
          </p>
        </div>
      )}

      <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <label className="flex-1">
          <span className="sr-only">Search webinars</span>
          <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search carbon, soil, markets..."
              className="w-full bg-transparent py-3 text-foreground outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </span>
        </label>
        <div role="group" aria-label="Filter webinars by topic" className="flex flex-wrap gap-2">
          <TopicChip active={topic === ALL_TOPICS} onClick={() => setTopic(ALL_TOPICS)}>
            All topics
          </TopicChip>
          {WEBINAR_TOPICS.map((item) => (
            <TopicChip key={item.id} active={topic === item.id} onClick={() => setTopic(item.id)}>
              {item.label}
            </TopicChip>
          ))}
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {upcoming.length} upcoming and {past.length} past{' '}
          {upcoming.length + past.length === 1 ? 'session' : 'sessions'}
          {hasFilters ? ' matching your filters' : ''}
        </p>
      </div>

      <h2 className="mt-12 text-2xl font-semibold text-foreground">Upcoming sessions</h2>
      <div className="mt-4 flex flex-col gap-6">
        {upcoming.length === 0 ? (
          <EmptyState>
            {hasFilters
              ? 'No upcoming sessions match your filters yet. Clear the search or pick another topic to see the full schedule.'
              : 'The next season of sessions is being scheduled. Check back soon for new dates.'}
          </EmptyState>
        ) : (
          upcoming.map((session) => (
            <WebinarSessionCard
              key={session.slug}
              session={session}
              status="upcoming"
              isNext={session.slug === nextSession?.slug}
            />
          ))
        )}
      </div>

      <h2 className="mt-12 text-2xl font-semibold text-foreground">Past sessions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Recordings are published within a week of each session.
      </p>
      <div className="mt-4 flex flex-col gap-6">
        {past.length === 0 ? (
          <EmptyState>
            No sessions have been delivered yet. The first session of this series is coming up.
          </EmptyState>
        ) : (
          past.map((session) => (
            <WebinarSessionCard key={session.slug} session={session} status="past" />
          ))
        )}
      </div>
    </section>
  );
}
