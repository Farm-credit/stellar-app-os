import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Globe,
  PlayCircle,
  UserRound,
  Users,
} from 'lucide-react';
import {
  WEBINAR_SESSIONS,
  findWebinarSessionBySlug,
  formatWebinarDate,
  formatWebinarTimeRange,
  getSeatAvailability,
  getWebinarStart,
  getWebinarTopic,
} from '@/lib/webinars';
import { withLiveSeats } from '@/lib/webinarRegistrations';
import { WebinarRegistrationForm } from '@/components/organisms/WebinarSeries';

interface WebinarSessionPageProps {
  params: Promise<{ slug: string }>;
}

// Seat counts and the upcoming/past split change over time.
export const revalidate = 300;

export function generateStaticParams() {
  return WEBINAR_SESSIONS.map((session) => ({ slug: session.slug }));
}

export async function generateMetadata({ params }: WebinarSessionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const session = findWebinarSessionBySlug(slug);
  if (!session) return { title: 'Webinar not found' };
  return { title: `${session.title} — farmer training webinar`, description: session.summary };
}

export default async function WebinarSessionPage({ params }: WebinarSessionPageProps) {
  const { slug } = await params;
  const published = findWebinarSessionBySlug(slug);
  if (!published) notFound();

  const session = withLiveSeats(published);
  const topic = getWebinarTopic(session.topicId);
  const seats = getSeatAvailability(session);
  const isUpcoming = getWebinarStart(session).getTime() > Date.now();

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl" aria-labelledby="webinar-title">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-stellar-blue/10 px-3 py-1 text-xs font-semibold text-stellar-blue">
            {topic.label}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {session.level}
          </span>
        </div>

        <h1 id="webinar-title" className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
          {session.title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{session.summary}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Part of the <strong>{topic.label}</strong> track: {topic.summary}
        </p>

        <dl className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="font-medium text-foreground">Date</dt>
              <dd>
                <time dateTime={session.date}>{formatWebinarDate(session.date)}</time>
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="font-medium text-foreground">Time</dt>
              <dd>
                {formatWebinarTimeRange(session)} ({session.durationMinutes} min)
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="font-medium text-foreground">Timezone</dt>
              <dd>{session.timeZone}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="font-medium text-foreground">Facilitator</dt>
              <dd>{session.facilitator}</dd>
            </div>
          </div>
          {isUpcoming && (
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="font-medium text-foreground">Seats</dt>
                <dd>{seats.label}</dd>
              </div>
            </div>
          )}
        </dl>

        <div className="mt-8">
          {isUpcoming ? (
            <div className="space-y-4">
              <a
                href={`/api/v2/webinars/${session.slug}/calendar`}
                className="inline-flex items-center gap-2 rounded-lg border border-stellar-blue px-4 py-2 text-sm font-semibold text-stellar-blue transition-colors hover:bg-stellar-blue/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Add to calendar
              </a>
              <WebinarRegistrationForm
                slug={session.slug}
                title={session.title}
                isFull={seats.isFull}
              />
            </div>
          ) : session.recordingUrl ? (
            <a
              href={session.recordingUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stellar-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              Watch the recording
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              This session has been delivered. The recording is coming soon.
            </p>
          )}
        </div>

        <Link
          href="/farmer-guides/webinars"
          className="mt-12 inline-block text-sm font-semibold text-stellar-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
        >
          ← All webinars
        </Link>
      </article>
    </main>
  );
}
