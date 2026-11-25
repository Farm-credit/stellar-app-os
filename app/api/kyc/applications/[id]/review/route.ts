/*
 * POST /api/kyc/applications/:id/review
 *
 * Performs a workflow transition or screening action on a Farmer KYC application:
 *   - { "action": "start_review" }            -> transitions `submitted` -> `under_review`
 *   - { "action": "rescreen" }                -> re-runs certification eligibility screening
 *   - { "action": "expire", "reason"?: string } -> transitions application to `expired`
 *
 * Responses:
 *   200  { application, workflow, onChainStatus }
 *   400  { error }
 *   404  { error: "KYC application not found" }
 *   409  { error }  — invalid workflow state transition
 *   500  { error: string }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKycService } from '@/lib/kyc/service';
import { evaluateKycWorkflow } from '@/lib/kyc/workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReviewAction = 'start_review' | 'rescreen' | 'expire';
const VALID_ACTIONS: readonly ReviewAction[] = ['start_review', 'rescreen', 'expire'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const { action, reason } = body as Record<string, unknown>;
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action as ReviewAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  if (reason !== undefined && typeof reason !== 'string') {
    return NextResponse.json({ error: 'reason must be a string when provided' }, { status: 400 });
  }

  try {
    const service = getKycService();

    if (action === 'rescreen') {
      const updated = await service.rescreenApplication(id);
      if (!updated) {
        return NextResponse.json({ error: 'KYC application not found' }, { status: 404 });
      }
      return NextResponse.json({
        application: updated,
        workflow: evaluateKycWorkflow(updated),
        onChainStatus: service.onChainStatusFor(updated),
      });
    }

    const result =
      action === 'start_review'
        ? await service.startReview(id)
        : await service.expireApplication(id, reason);

    if (!result.ok || !result.application) {
      const notFound = result.error?.includes('not found') ?? false;
      return NextResponse.json(
        { error: result.error ?? 'Unable to update KYC workflow status' },
        { status: notFound ? 404 : 409 }
      );
    }

    return NextResponse.json({
      application: result.application,
      workflow: evaluateKycWorkflow(result.application),
      onChainStatus: service.onChainStatusFor(result.application),
    });
  } catch (error) {
    console.error('[api/kyc/applications/:id/review] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
