/*
 * POST /api/kyc/applications  — submit a farmer KYC application
 * GET  /api/kyc/applications  — list applications (reviewer worklist)
 *
 * POST validates, screens for certification eligibility, and stores the
 * verdict. A submission that fails a blocking gate is stored as `rejected`
 * with the reason recorded, so the farmer gets a definite answer rather than a
 * quiet queue entry; only cases that could still be approved land in the
 * review queue.
 *
 * GET defaults to the open queue (`submitted`, `under_review`). Pass `status`
 * to look at settled cases.
 *
 * Query parameters (GET):
 * - status: submitted | under_review | approved | rejected | expired
 * - farmerAddress: Stellar public key
 * - region
 * - tier: full | provisional | none
 * - limit (1-200, default 50), offset (default 0)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getKycService, type ListKycFilters } from '@/lib/kyc/service';
import type { CertificationTier, KycApplicationStatus } from '@/lib/kyc/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPLICATION_STATUSES: readonly KycApplicationStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'expired',
];

const TIERS: readonly CertificationTier[] = ['full', 'provisional', 'none'];

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  try {
    const result = await getKycService().submitApplication(body);

    if (!result.ok || !result.application) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.errors ?? [] },
        { status: 400 }
      );
    }

    const application = result.application;
    const onChainStatus = getKycService().onChainStatusFor(application);

    return NextResponse.json(
      {
        application,
        screening: application.screening,
        // The status a verifier should attest on-chain for this application.
        onChainStatus,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[api/kyc/applications] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get('status');
  if (statusParam && !APPLICATION_STATUSES.includes(statusParam as KycApplicationStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const tierParam = searchParams.get('tier');
  if (tierParam && !TIERS.includes(tierParam as CertificationTier)) {
    return NextResponse.json(
      { error: `tier must be one of: ${TIERS.join(', ')}` },
      { status: 400 }
    );
  }

  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  const filters: ListKycFilters = {
    status: (statusParam as KycApplicationStatus | null) ?? undefined,
    farmerAddress: searchParams.get('farmerAddress') ?? undefined,
    region: searchParams.get('region') ?? undefined,
    tier: (tierParam as CertificationTier | null) ?? undefined,
    limit: limitParam ? Number.parseInt(limitParam, 10) : undefined,
    offset: offsetParam ? Number.parseInt(offsetParam, 10) : undefined,
  };

  if (limitParam && !Number.isFinite(filters.limit)) {
    return NextResponse.json({ error: 'limit must be a number' }, { status: 400 });
  }
  if (offsetParam && !Number.isFinite(filters.offset)) {
    return NextResponse.json({ error: 'offset must be a number' }, { status: 400 });
  }

  try {
    const applications = await getKycService().listApplications(filters);
    return NextResponse.json({
      count: applications.length,
      applications,
    });
  } catch (error) {
    console.error('[api/kyc/applications] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
