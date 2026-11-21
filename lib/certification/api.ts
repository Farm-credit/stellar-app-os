import { NextResponse } from 'next/server';
import { authenticateFarmerVerificationRequest } from '@/lib/api/farmer-verification-auth';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { CertificationIntegrationError } from './errors';

export interface CertificationApiClient {
  id: number;
  tier: string;
}

export type CertificationApiAuth =
  { ok: true; client: CertificationApiClient } | { ok: false; response: NextResponse };

export function certificationHeaders(tier?: string): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
    ...(tier ? { 'X-API-Tier': tier } : {}),
  };
}

export async function authenticateCertificationRequest(
  request: Request
): Promise<CertificationApiAuth> {
  try {
    const auth = await authenticateFarmerVerificationRequest(request);
    if (!auth.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: auth.error },
          { status: auth.status, headers: certificationHeaders() }
        ),
      };
    }
    return { ok: true, client: { id: auth.client.id, tier: auth.client.tier } };
  } catch (error) {
    console.error('[certification-api] authentication lookup failed', { error });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authentication is temporarily unavailable' },
        { status: 503, headers: certificationHeaders() }
      ),
    };
  }
}

export function certificationErrorResponse(error: unknown, tier?: string): NextResponse {
  if (error instanceof CertificationIntegrationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: certificationHeaders(tier) }
    );
  }

  console.error('[certification-api] request failed', { error });
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500, headers: certificationHeaders(tier) }
  );
}

export async function parseJsonBody(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', details: [] },
      { status: 400, headers: certificationHeaders() }
    );
  }
}
