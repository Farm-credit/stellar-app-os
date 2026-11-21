import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { VolunteerError } from './service';

export const VOLUNTEER_COOKIE = 'farmcredit_volunteer_session';

export function volunteerOrigin(request: NextRequest): string {
  const url = new URL(request.url);
  // Next may normalize the internal request URL to localhost. The browser's
  // Host header identifies the cookie's origin and cannot be set by fetch JS.
  const host = request.headers.get('host');
  if (host) url.host = host;
  return url.origin;
}

export function requireSameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== volunteerOrigin(request)) {
    throw new VolunteerError('A same-origin request is required', 403);
  }
}

export async function volunteerWallet(request: NextRequest): Promise<string> {
  if (!process.env.JWT_SECRET) throw new VolunteerError('Sign-in is not configured', 503);
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ')
    ? bearer.slice(7)
    : request.cookies.get(VOLUNTEER_COOKIE)?.value;
  if (!token) throw new VolunteerError('Sign in to continue', 401);
  if (!bearer && request.method !== 'GET') requireSameOrigin(request);
  const payload = await verifyPlanterJwt(token);
  if (
    !payload ||
    payload.role !== 'planter' ||
    payload.type !== 'access' ||
    !/^G[A-Z2-7]{55}$/.test(payload.sub)
  ) {
    throw new VolunteerError('Your session has expired. Please sign in again', 401);
  }
  return payload.sub;
}

export function volunteerResponse(error: unknown) {
  if (error instanceof VolunteerError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json({ error: 'Please check the submitted fields' }, { status: 400 });
  console.error('[volunteers] request failed', error);
  return NextResponse.json(
    { error: 'Unable to complete the request. Please try again' },
    { status: 500 }
  );
}
