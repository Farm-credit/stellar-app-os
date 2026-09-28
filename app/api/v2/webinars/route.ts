/**
 * GET /api/v2/webinars — Issue #1419
 *
 * The farmer training webinar series with live seat counts.
 *   ?topic=soil-testing    optional curriculum track filter
 *   &q=offtake             optional free-text search
 */

import { NextResponse } from 'next/server';
import {
  WEBINAR_SESSIONS,
  WEBINAR_TOPICS,
  filterWebinarSessions,
  getPastWebinarSessions,
  getUpcomingWebinarSessions,
  summarizeWebinarSeries,
  type WebinarTopicId,
} from '@/lib/webinars';
import { withLiveSeats } from '@/lib/webinarRegistrations';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const headers = apiVersionHeaders('v2') as Record<string, string>;

export function GET(request: Request): NextResponse {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic') ?? 'all';

  if (topic !== 'all' && !WEBINAR_TOPICS.some((item) => item.id === topic)) {
    return NextResponse.json(
      {
        error: 'Invalid webinar request',
        details: [`topic must be one of: ${WEBINAR_TOPICS.map((item) => item.id).join(', ')}`],
      },
      { status: 400, headers }
    );
  }

  const now = new Date();
  const sessions = filterWebinarSessions(
    WEBINAR_SESSIONS.map(withLiveSeats),
    searchParams.get('q') ?? '',
    topic as WebinarTopicId | 'all'
  );

  return NextResponse.json(
    {
      topics: WEBINAR_TOPICS,
      summary: summarizeWebinarSeries(sessions, now),
      upcoming: getUpcomingWebinarSessions(sessions, now),
      past: getPastWebinarSessions(sessions, now),
    },
    { headers }
  );
}
