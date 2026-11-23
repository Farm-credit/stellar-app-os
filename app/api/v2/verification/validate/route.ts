/**
 * POST /api/v2/verification/validate — Issue #1259
 *
 * Dry-run of validate-and-issue: checks a credit request against the
 * registered Verra / Gold Standard project without allocating credits or
 * issuing an NFT.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  ProtocolVerificationError,
  validateCreditsAgainstProject,
} from '@/lib/api/protocol-verification';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { projectId?: unknown; creditsTonnes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.', code: 'invalid_request' },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const result = await validateCreditsAgainstProject(body?.projectId, body?.creditsTonnes);
    return NextResponse.json(
      {
        valid: true,
        projectId: result.project.projectId,
        protocol: result.project.protocol,
        registryId: result.project.registryId,
        creditsTonnes: result.creditsTonnes,
        remainingAfterTonnes: result.remainingAfterTonnes,
        registryUrl: result.project.registryUrl,
      },
      { headers: responseHeaders() }
    );
  } catch (error) {
    if (error instanceof ProtocolVerificationError) {
      return NextResponse.json(
        { valid: false, error: error.message, code: error.code },
        { status: error.status, headers: responseHeaders() }
      );
    }
    console.error('[api/v2/verification/validate] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
