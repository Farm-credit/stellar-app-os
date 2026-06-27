import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';

// Auth endpoints get a much stricter limit to slow brute-force attacks.
const AUTH_LIMIT = 10; // per minute
const DEFAULT_LIMIT = 100; // per minute

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export function middleware(request: NextRequest): NextResponse {
  const ip = getClientIp(request);
  const { pathname } = request.nextUrl;

  const limit = pathname.startsWith('/api/auth/') ? AUTH_LIMIT : DEFAULT_LIMIT;
  const result = checkRateLimit(ip, limit);

  if (!result.allowed) {
    if (result.reason === 'blocklist') {
      return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter ?? 60),
        'X-RateLimit-Limit': String(limit),
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
