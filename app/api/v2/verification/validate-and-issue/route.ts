/**
 * POST /api/v2/verification/validate-and-issue — Issue #1383
 *
 * Automatically validate carbon credits against registered Verra / Gold Standard
 * projects and issue the corresponding NFT certificate.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  ProtocolVerificationError,
  validateAndIssueProtocolNft,
  type ValidateAndIssueRequest,
} from '@/lib/api/protocol-verification';
import { notifyCreditVerified } from '@/lib/webhook/offset-verification-bridge';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: ValidateAndIssueRequest;
    try {
      body = (await request.json()) as ValidateAndIssueRequest;
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON.', code: 'invalid_request' },
        { status: 400, headers: responseHeaders() }
      );
    }

    const issuedNft = await validateAndIssueProtocolNft(body);

    // Outbound `credit.verified` notification (issue #1316). Fire-and-forget:
    // the bridge never throws, so a webhook problem cannot fail the issuance.
    void notifyCreditVerified({
      creditId: issuedNft.tokenId,
      assetCode: `CARBON-${issuedNft.registryId}-${new Date(issuedNft.issuedAt).getUTCFullYear()}`,
      projectId: issuedNft.projectId,
      projectName: issuedNft.projectName,
      quantityTonnes: issuedNft.creditsTonnes,
      vintage: new Date(issuedNft.issuedAt).getUTCFullYear(),
      standard: issuedNft.protocol,
      verifier: `${issuedNft.protocol} Registry`,
      registry: issuedNft.protocol,
      verificationReportUrl: issuedNft.registryUrl,
      transactionHash: issuedNft.transactionHash,
      explorerUrl: `https://stellar.expert/explorer/public/tx/${issuedNft.transactionHash}`,
      verifiedAt: issuedNft.issuedAt,
    });

    return NextResponse.json(issuedNft, { headers: responseHeaders() });
  } catch (error) {
    if (error instanceof ProtocolVerificationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: responseHeaders() }
      );
    }
    console.error('[api/v2/verification/validate-and-issue] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
