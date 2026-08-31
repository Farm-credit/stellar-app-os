/**
 * Manage API keys for the authenticated planter.
 *
 * Includes:
 *   POST  /api/api-keys         create a new API key (raw key returned once)
 *   GET   /api/api-keys         list the caller's API keys (key hashes, not raw)
 *
 * Authentication:
 *   Requires a valid planter JWT (Authorization: Bearer <token>). Keys are
 *   scoped to the authenticated wallet address.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyPlanterJwt } from '@/lib/auth/jwt';
import { createApiKey, listApiKeys } from '@/lib/api/apiKeys';
import { isApiKeyTier } from '@/lib/api/apiKeyTiers';
import type { ApiKeyTier } from '@/lib/db/schema';

export const runtime = 'nodejs';

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function authenticate(request: NextRequest): Promise<string | NextResponse> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return jsonError('Authorization header with Bearer token is required', 401);

  const payload = await verifyPlanterJwt(token);
  if (!payload?.sub) return jsonError('Invalid or expired token', 401);
  return payload.sub;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (typeof auth !== 'string') return auth;

  try {
    const keys = await listApiKeys(auth);
    const safe = keys.map((k) => ({
      id: String(k.id),
      name: k.name,
      prefix: k.prefix,
      tier: k.tier,
      createdAt: k.created_at.toISOString(),
      lastUsedAt: k.last_used_at?.toISOString() ?? null,
      revokedAt: k.revoked_at?.toISOString() ?? null,
      active: k.is_active,
    }));
    return NextResponse.json({ keys: safe });
  } catch (error) {
    console.error('[api-keys] list failed', { error });
    return jsonError('Internal server error', 500);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (typeof auth !== 'string') return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid request body', 400);
  }

  const name =
    typeof (body as { name?: unknown })?.name === 'string'
      ? (body as { name: string }).name.trim()
      : '';
  if (!name || name.length > 80) {
    return jsonError('name is required (max 80 characters)', 422);
  }

  const rawTier = (body as { tier?: unknown })?.tier ?? 'free';
  if (!isApiKeyTier(rawTier)) {
    return jsonError('tier must be one of: free, standard, premium', 422);
  }
  const tier = rawTier as ApiKeyTier;

  try {
    const created = await createApiKey({ name, tier, ownerWallet: auth });
    return NextResponse.json(
      {
        key: created.key, // shown only once
        keyHash: created.keyHash,
        prefix: created.prefix,
        id: String(created.id),
        tier,
        name,
        note: 'Store this key securely — it will not be shown again.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[api-keys] create failed', { error });
    return jsonError('Internal server error', 500);
  }
}
