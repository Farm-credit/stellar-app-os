import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';
import { sanctionLookupSchema } from '@/lib/sanctions/schema';
import { lookupSanctionList } from '@/lib/sanctions/service';
import type { SanctionLookupResponse } from '@/lib/types/sanctions';

/**
 * POST /api/sanctions/lookup
 *
 * Checks a single Stellar wallet address against the configured sanction list
 * provider. Results are cached in the DB for 24 hours (configurable via
 * SANCTION_CACHE_TTL_MS). Every call — cache hit or miss — is recorded in
 * the immutable sanction_audit_log table.
 *
 * Request body: { stellar_address: string; context?: string }
 * Response:     SanctionLookupResponse
 *
 * Security:
 * - Zod schema validates the address format (must be G…56-char base32).
 * - Only authenticated admin/system callers should reach this endpoint in
 *   production. Apply middleware auth at the route group level.
 * - Provider API keys are read from env (never echoed back to the client).
 * - raw_response from providers is stored in DB but never returned to client.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = sanctionLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 422 }
    );
  }

  const { stellar_address, context } = parsed.data;

  // Derive a caller identity from headers for audit trail.
  // In production this should come from your JWT/session middleware.
  const requestedBy =
    request.headers.get('x-admin-id') ?? request.headers.get('x-user-id') ?? 'system';

  try {
    const pool = getPool();
    const result = await lookupSanctionList(pool, stellar_address, {
      requestedBy,
      requestContext: context,
    });

    const response: SanctionLookupResponse = {
      stellar_address: result.stellar_address,
      result: result.result,
      provider: result.provider,
      cache_hit: result.cache_hit,
      checked_at: result.checked_at,
      cache_expires_at: result.cache_expires_at,
    };

    const status = result.result === 'error' ? 502 : 200;
    return NextResponse.json(response, { status });
  } catch (err) {
    logger.error('[api/sanctions/lookup] unhandled error', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
