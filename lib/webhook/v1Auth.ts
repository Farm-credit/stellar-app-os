import { NextResponse } from 'next/server';
import { readApiKey } from '@/lib/api/api-key-header';
import { findApiKeyByRawValue } from '@/lib/api/apiKeys';
import { apiVersionHeaders } from '@/lib/api/versioning';

export type WebhookApiScope = 'webhooks:read' | 'webhooks:write';

export interface WebhookV1Caller {
  apiKeyId: number;
  name: string;
  prefix: string;
  tier: string;
  ownerWallet: string | null;
  scopes: string[];
}

export type WebhookV1AuthResult =
  | { ok: true; caller: WebhookV1Caller; headers: Record<string, string> }
  | { ok: false; response: NextResponse };

export function webhookV1Headers(tier?: string): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v1') as Record<string, string>),
    ...(tier ? { 'X-API-Tier': tier } : {}),
  };
}

/**
 * Authenticate `/api/v1/webhooks/**` exclusively via DB-backed `api_keys`
 * (`X-API-Key` or `Authorization: ApiKey <key>`). Unverified OAuth2 bearer
 * tokens from the in-memory `defaultAuthStore` are intentionally rejected.
 */
export async function authenticateWebhookV1Request(
  request: Request,
  requiredScope: WebhookApiScope,
  lookup = findApiKeyByRawValue
): Promise<WebhookV1AuthResult> {
  const rawKey = readApiKey(request);
  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Provide a valid API key via X-API-Key or Authorization: ApiKey header.',
        },
        { status: 401, headers: webhookV1Headers() }
      ),
    };
  }

  let keyRecord;
  try {
    keyRecord = await lookup(rawKey);
  } catch (error) {
    console.error('[api/v1/webhooks] API key lookup failed', error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'service_unavailable', message: 'Authentication service unavailable.' },
        { status: 503, headers: webhookV1Headers() }
      ),
    };
  }

  if (!keyRecord || !keyRecord.is_active || keyRecord.revoked_at !== null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized', message: 'Invalid, revoked, or inactive API key.' },
        { status: 401, headers: webhookV1Headers() }
      ),
    };
  }

  const scopes = Array.isArray(keyRecord.scopes)
    ? keyRecord.scopes
    : ['webhooks:read', 'webhooks:write'];

  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'forbidden',
          message: `API key is missing required scope: ${requiredScope}`,
        },
        { status: 403, headers: webhookV1Headers(keyRecord.tier) }
      ),
    };
  }

  return {
    ok: true,
    caller: {
      apiKeyId: keyRecord.id,
      name: keyRecord.name,
      prefix: keyRecord.prefix,
      tier: keyRecord.tier,
      ownerWallet: keyRecord.owner_wallet,
      scopes,
    },
    headers: webhookV1Headers(keyRecord.tier),
  };
}
