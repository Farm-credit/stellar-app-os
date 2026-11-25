/*
 * GET /api/kyc/applications/:id/workflow
 *
 * Returns the 4-stage Farmer KYC verification workflow summary:
 *   1. Identity Verification
 *   2. Land Ownership Proof
 *   3. Agricultural Experience
 *   4. Certification Eligibility Screening
 *
 * Responses:
 *   200  { workflow, application, onChainStatus }
 *   404  { error: "KYC application not found" }
 *   500  { error: string }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKycService } from '@/lib/kyc/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const service = getKycService();
    const summary = await service.getWorkflowSummary(id);

    if (!summary) {
      return NextResponse.json({ error: 'KYC application not found' }, { status: 404 });
    }

    return NextResponse.json({
      workflow: summary.workflow,
      application: summary.application,
      onChainStatus: service.onChainStatusFor(summary.application),
    });
  } catch (error) {
    console.error('[api/kyc/applications/:id/workflow] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
