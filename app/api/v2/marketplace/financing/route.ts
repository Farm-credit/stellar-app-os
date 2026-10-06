/**
 * GET /api/v2/marketplace/financing — Issues #1352, #1414
 *   ?farmerId=...                                   optional filter
 *   &landSizeHectares=..&region=..&practiceType=..  optional: adds a credit-limit quote
 *
 * POST /api/v2/marketplace/financing — Issues #1352, #1414
 *   { farmerId, projectName, requestedAmount, farmerName?, location?,
 *     carbonProjectLinkedId?, landSizeHectares?, region?, practiceType? }
 *   With land details the line is underwritten against projected first
 *   carbon sales; without them it is capped at MAX_CREDIT_LINE_USD.
 *
 * Repayments from carbon credit sales:
 *   /api/v2/marketplace/financing/:id/repayments
 */

import { NextResponse } from 'next/server';
import {
  applyForLandPrepCredit,
  calculateLandPrepCreditLimit,
  getFarmerCreditLines,
  parseLandProfile,
} from '@/lib/marketplace/farmerFinancing';
import { financingErrorResponse } from '@/lib/marketplace/financingHttp';

export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const farmerId = searchParams.get('farmerId') || undefined;
    const lines = getFarmerCreditLines(farmerId);

    const land = parseLandProfile({
      landSizeHectares: searchParams.get('landSizeHectares') ?? undefined,
      region: searchParams.get('region') ?? undefined,
      practiceType: searchParams.get('practiceType') ?? undefined,
    });

    return NextResponse.json({
      success: true,
      creditLines: lines,
      ...(land ? { eligibility: calculateLandPrepCreditLimit(land) } : {}),
    });
  } catch (error) {
    return financingErrorResponse(error, 'Failed to fetch credit lines');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { farmerId, farmerName, projectName, location, requestedAmount, carbonProjectLinkedId } =
      body;

    if (!farmerId || !projectName || !requestedAmount) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: farmerId, projectName, requestedAmount',
        },
        { status: 400 }
      );
    }

    const newLine = applyForLandPrepCredit({
      farmerId,
      farmerName: farmerName || 'Verified Farmer',
      projectName,
      location: location || 'Sub-Saharan Africa',
      requestedAmount: Number(requestedAmount),
      carbonProjectLinkedId: carbonProjectLinkedId || 'listing-001',
      land: parseLandProfile(body),
    });

    return NextResponse.json({ success: true, creditLine: newLine }, { status: 201 });
  } catch (error) {
    return financingErrorResponse(error, 'Failed to apply for land prep credit');
  }
}
