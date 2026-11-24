/**
 * GET /api/v2/webinars/:slug/calendar — Issue #1419
 *
 * Download a session as an `.ics` file for any calendar app.
 */

import { NextResponse } from 'next/server';
import { buildWebinarIcs, findWebinarSessionBySlug } from '@/lib/webinars';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;
  const session = findWebinarSessionBySlug(slug);
  if (!session) {
    return NextResponse.json({ error: `Webinar ${slug} not found` }, { status: 404 });
  }

  return new NextResponse(buildWebinarIcs(session, { siteUrl: new URL(request.url).origin }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${session.slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
