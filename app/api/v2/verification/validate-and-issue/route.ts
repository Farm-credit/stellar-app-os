/**
 * POST /api/v2/verification/validate-and-issue — Issue #1383
 *
 * Automatically validate carbon credits against registered Verra / Gold Standard
 * projects and issue the corresponding NFT certificate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  validateAndIssueProtocolNft,
  type ValidateAndIssueRequest,
} from '@/lib/api/protocol-verification';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ValidateAndIssueRequest;

    if (!body.projectId || !body.recipientAddress || !body.creditsTonnes) {
      return NextResponse.json(
        {
          error:
            'projectId, recipientAddress, and positive creditsTonnes are required.',
        },
        { status: 400, headers: responseHeaders() }
      );
    }

    const issuedNft = await validateAndIssueProtocolNft(body);
    return NextResponse.json(issuedNft, { headers: responseHeaders() });
  } catch (error) {
    console.error('[api/v2/verification/validate-and-issue] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 400, headers: responseHeaders() }
    );
  }
}
