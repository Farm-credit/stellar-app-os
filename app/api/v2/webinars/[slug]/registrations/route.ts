/**
 * POST /api/v2/webinars/:slug/registrations — Issue #1419
 *
 * Register for an upcoming farmer training webinar.
 *   { name: string, email: string, location?: string }
 *
 * Responses:
 *   201  { registration, seats }   status is `registered` or `waitlisted`
 *   400  { error, details }        invalid form
 *   404  unknown session · 409 already registered · 410 session has started
 */

import { NextResponse } from 'next/server';
import { validateWebinarRegistration } from '@/lib/webinars';
import { WebinarRegistrationError, registerForWebinar } from '@/lib/webinarRegistrations';
import { apiVersionHeaders } from '@/lib/api/versioning';

export const runtime = 'nodejs';

const headers = apiVersionHeaders('v2') as Record<string, string>;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = validateWebinarRegistration(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Invalid registration', details: parsed.errors },
      { status: 400, headers }
    );
  }

  try {
    const result = registerForWebinar(slug, parsed.data);
    return NextResponse.json(result, { status: 201, headers });
  } catch (error) {
    if (error instanceof WebinarRegistrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    console.error('[api/v2/webinars/registrations] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
