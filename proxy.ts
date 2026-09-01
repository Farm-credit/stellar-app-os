import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getCorsHeaders, handleCorsPreflight, isOriginAllowed } from '@/lib/cors';

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

export function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');

  // Handle CORS preflight (OPTIONS) requests
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Reject requests from non-verified origins
  if (origin && !isOriginAllowed(origin)) {
    return new NextResponse(
      JSON.stringify({
        error: 'Forbidden',
        message: 'CORS policy violation: Origin not allowed',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

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

  const txId = request.headers.get('x-tx-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tx-id', txId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Attach CORS response headers for valid cross-origin requests
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};

