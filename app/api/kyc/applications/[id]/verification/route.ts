/*
 * POST /api/kyc/applications/:id/verification
 *
 * Verifier sign-off on an application's supporting evidence: the identity
 * document checked against the person, and/or the land claim confirmed. This is
 * the step that can satisfy the blocking `identity_verified` and
 * `land_proof_verified` gates — a farmer cannot self-certify, because the
 * submission validator never reads verification timestamps from a request body.
 *
 * The application is re-screened immediately, so the response carries the
 * updated verdict rather than the one from submission time.
 *
 * Body:
 *   { "identityVerified": boolean, "landVerified": boolean, "verifiedAt"?: ISO8601 }
 *
 * Responses:
 *   200  { application, screening, onChainStatus }
 *   400  { error }
 *   404  { error: "KYC application not found" }
 *   409  { error }  — the application is already settled
 *   500  { error: string }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKycService } from '@/lib/kyc/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const { identityVerified, landVerified, verifiedAt } = body as Record<
    string,
    unknown
  >;

  if (typeof identityVerified !== 'boolean' || typeof landVerified !== 'boolean') {
    return NextResponse.json(
      {
        error:
          'identityVerified and landVerified are required booleans; at least one must be true',
      },
      { status: 400 }
    );
  }

  if (!identityVerified && !landVerified) {
    return NextResponse.json(
      { error: 'At least one of identityVerified or landVerified must be true' },
      { status: 400 }
    );
  }

  if (verifiedAt !== undefined) {
    if (typeof verifiedAt !== 'string' || Number.isNaN(new Date(verifiedAt).getTime())) {
      return NextResponse.json(
        { error: 'verifiedAt must be an ISO-8601 timestamp when provided' },
        { status: 400 }
      );
    }
  }

  try {
    const service = getKycService();
    const result = await service.recordVerification(id, {
      identityVerified,
      landVerified,
      verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : undefined,
    });

    if (!result.ok || !result.application) {
      const notFound = result.error?.includes('not found') ?? false;
      return NextResponse.json(
        { error: result.error ?? 'Unable to record verification' },
        { status: notFound ? 404 : 409 }
      );
    }

    return NextResponse.json({
      application: result.application,
      screening: result.application.screening,
      onChainStatus: service.onChainStatusFor(result.application),
    });
  } catch (error) {
    console.error('[api/kyc/applications/:id/verification] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
