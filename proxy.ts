import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { checkTieredRateLimit, WINDOW_MS } from '@/lib/rateLimit/tieredRateLimit';
import { findApiKeyByRawValue, touchApiKey, recordApiKeyUsage } from '@/lib/api/apiKeys';

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

/**
 * Extracts a bearer API key from the `x-api-key` header. Returns null when the
 * header is absent or malformed.
 */
function getApiKey(request: NextRequest): string | null {
  const raw = request.headers.get('x-api-key');
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const { pathname } = request.nextUrl;

  const txId = request.headers.get('x-tx-id') ?? crypto.randomUUID();
  const passHeaders = new Headers(request.headers);
  passHeaders.set('x-tx-id', txId);

  // Requests presenting an API key are governed by their tier's rolling hourly
  // budget rather than the shared per-IP minute limit.
  const apiKey = getApiKey(request);
  if (apiKey) {
    const tierResult = await enforceApiKeyLimit(apiKey, txId);
    if (tierResult) return tierResult;
    return NextResponse.next({
      request: { headers: passHeaders },
      headers: { 'X-TX-ID': txId },
    });
  }

  // Fall back to the shared per-IP limiter for non-API-key traffic.
  const limit = pathname.startsWith('/api/auth/') ? AUTH_LIMIT : DEFAULT_LIMIT;
  const result = await checkRateLimit(ip, limit);

  if (!result.allowed) {
    if (result.reason === 'blocklist') {
      return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'X-TX-ID': txId },
      });
    }

    return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter ?? 60),
        'X-RateLimit-Limit': String(limit),
        'X-TX-ID': txId,
      },
    });
  }

  return NextResponse.next({ request: { headers: passHeaders } });
}

/**
 * Enforces the tiered limit for a request carrying an API key. Returns a
 * response to short-circuit, or null when the request may proceed.
 *
 * When a key's rolling hourly budget is exhausted the request is queued and a
 * `429 Too Many Requests` (with `Retry-After`) is returned so the client can
 * back off; queued capacity is reclaimed as the window rolls.
 */
async function enforceApiKeyLimit(apiKey: string, txId: string): Promise<NextResponse | null> {
  try {
    const key = await findApiKeyByRawValue(apiKey);

    // Unknown / inactive / revoked key → reject with 401 so the client learns
    // its credential is invalid.
    if (!key) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'X-TX-ID': txId },
      });
    }

    await touchApiKey(key.id);
    const result = await checkTieredRateLimit(apiKey, key.tier);

    // Best-effort persistent usage accounting (keyed by the rolling hour).
    await recordApiKeyUsage(key.id, WINDOW_MS, 1, result.queued ? 1 : 0);

    if (!result.allowed) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-TX-ID': txId,
        'X-RateLimit-Tier': key.tier,
        'X-RateLimit-Queued': result.queued ? 'true' : 'false',
      };
      if (result.retryAfter !== undefined) {
        headers['Retry-After'] = String(result.retryAfter);
      }
      return new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Tiered request budget exhausted; your request has been queued.',
          queued: result.queued,
          retryAfter: result.retryAfter,
          tier: key.tier,
        }),
        { status: 429, headers }
      );
    }

    return null;
  } catch (error) {
    // Never fail closed on an unexpected infrastructure error — fall through
    // to the request so availability is preserved.
    console.error('[proxy] tiered rate limit failed open', { error });
    return null;
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
