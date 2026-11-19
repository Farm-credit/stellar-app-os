/*
 * GET   /api/kyc/applications/:id  — fetch one application
 * PATCH /api/kyc/applications/:id  — record a reviewer decision
 *
 * PATCH body:
 *   { "decision": "approve" | "reject", "reviewer": string, "reason"?: string }
 *
 * An `approve` is refused when the stored screening found a blocking failure.
 * A reviewer can clear the queue but cannot overrule the eligibility gates — a
 * ruling that looks wrong means the underlying evidence needs correcting and
 * the case re-screened (`POST /api/kyc/applications/:id/verification`).
 *
 * Responses:
 *   200  { application, onChainStatus }
 *   400  { error, details? }
 *   404  { error: "KYC application not found" }
 *   500  { error: string }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKycService } from '@/lib/kyc/service';
import type { KycDecision } from '@/lib/kyc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const service = getKycService();
    const application = await service.getApplication(id);

    if (!application) {
      return NextResponse.json(
        { error: 'KYC application not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      application,
      onChainStatus: service.onChainStatusFor(application),
    });
  } catch (error) {
    console.error('[api/kyc/applications/:id] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  const { decision, reviewer, reason } = body as Record<string, unknown>;

  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json(
      { error: 'decision must be either "approve" or "reject"' },
      { status: 400 }
    );
  }

  if (!isNonEmptyString(reviewer)) {
    return NextResponse.json(
      { error: 'reviewer is required' },
      { status: 400 }
    );
  }

  if (reason !== undefined && typeof reason !== 'string') {
    return NextResponse.json(
      { error: 'reason must be a string when provided' },
      { status: 400 }
    );
  }

  const record: KycDecision = {
    decision,
    reviewer: reviewer.trim(),
    reason: isNonEmptyString(reason) ? reason.trim() : undefined,
    decidedAt: new Date().toISOString(),
  };

  try {
    const service = getKycService();
    const result = await service.recordDecision(id, record);

    if (!result.ok || !result.application) {
      // A missing row is the only genuine 404; a refused transition is a
      // conflict between the decision and the application's current state.
      const notFound = result.error?.includes('not found') ?? false;
      return NextResponse.json(
        { error: result.error ?? 'Unable to record decision' },
        { status: notFound ? 404 : 409 }
      );
    }

    return NextResponse.json({
      application: result.application,
      onChainStatus: service.onChainStatusFor(result.application),
    });
  } catch (error) {
    console.error('[api/kyc/applications/:id] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
