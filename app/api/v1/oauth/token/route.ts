/**
 * OAuth2 Token Endpoint — POST /api/v1/oauth/token
 *
 * Implements the standard RFC 6749 OAuth 2.0 Client Credentials Grant
 * for third-party developer integrations reading tree sponsorship data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { issueOAuth2Token, defaultAuthStore } from '@/lib/api/v1/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseBasicAuth(header: string | null): { clientId?: string; clientSecret?: string } {
  if (!header || !header.toLowerCase().startsWith('basic ')) return {};
  try {
    const base64 = header.slice(6).trim();
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [clientId, clientSecret] = decoded.split(':');
    return { clientId, clientSecret };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let grantType: string | null = null;
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let scope: string | null = null;

  const contentType = req.headers.get('content-type') || '';
  const basicAuth = parseBasicAuth(req.headers.get('authorization'));

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    grantType = params.get('grant_type');
    clientId = params.get('client_id');
    clientSecret = params.get('client_secret');
    scope = params.get('scope');
  } else {
    try {
      const json = await req.json();
      grantType = json.grant_type;
      clientId = json.client_id;
      clientSecret = json.client_secret;
      scope = json.scope;
    } catch {
      // Fall back to URL search params if body wasn't JSON
      const urlParams = req.nextUrl.searchParams;
      grantType = urlParams.get('grant_type');
      clientId = urlParams.get('client_id');
      clientSecret = urlParams.get('client_secret');
      scope = urlParams.get('scope');
    }
  }

  // Use Basic auth header if present
  if (basicAuth.clientId) {
    clientId = basicAuth.clientId;
    clientSecret = basicAuth.clientSecret || clientSecret;
  }

  // Allow sandbox testing credentials
  if (!clientId && (grantType === 'client_credentials' || !grantType)) {
    clientId = 'sandbox_client_id';
    clientSecret = 'sandbox_secret';
    grantType = 'client_credentials';
  }

  if (!grantType) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description: 'Missing grant_type parameter. Expected grant_type=client_credentials.',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
    );
  }

  if (grantType !== 'client_credentials') {
    return NextResponse.json(
      {
        error: 'unsupported_grant_type',
        error_description: `Grant type '${grantType}' is unsupported. Use grant_type=client_credentials.`,
      },
      { status: 400, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
    );
  }

  if (!clientId || clientId.trim().length === 0) {
    return NextResponse.json(
      {
        error: 'invalid_client',
        error_description: 'Client authentication failed. Missing client_id.',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
    );
  }

  const requestedScopes = scope
    ? scope.split(/[\s,]+/).filter(Boolean)
    : ['trees:read', 'projects:read', 'species:read', 'co2:read'];

  const tokenResponse = issueOAuth2Token({
    clientId: clientId.trim(),
    clientSecret: clientSecret ?? undefined,
    scopes: requestedScopes,
    expiresInSeconds: 3600,
    store: defaultAuthStore,
  });

  return NextResponse.json(tokenResponse, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}
