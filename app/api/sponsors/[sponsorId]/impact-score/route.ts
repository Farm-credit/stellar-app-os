/**
 * GET /api/sponsors/:sponsorId/impact-score — Issue #1689
 * Returns the personalised Social Impact Score (out of 1000) and factor breakdown
 * for an individual sponsor.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  calculateSocialImpactScore,
  getSponsorSocialImpactScore,
} from '@/lib/impact/social-impact-score';
import { getSponsorProfile } from '@/lib/api/sponsors';

interface RouteParams {
  params: Promise<{ sponsorId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { sponsorId } = await params;
  const address = decodeURIComponent(sponsorId);

  const profile = getSponsorProfile(address);
  if (!profile) {
    return NextResponse.json({ success: false, error: 'Sponsor not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const simulateTrees = searchParams.get('trees');
  const simulateSpecies = searchParams.get('species');
  const simulateRegions = searchParams.get('regions');
  const simulateYears = searchParams.get('years');

  // If simulation query params are provided, compute with simulated overrides
  if (
    simulateTrees !== null ||
    simulateSpecies !== null ||
    simulateRegions !== null ||
    simulateYears !== null
  ) {
    const baseScore = getSponsorSocialImpactScore(address);
    const simulated = calculateSocialImpactScore({
      treesFunded:
        simulateTrees !== null
          ? Number(simulateTrees)
          : (baseScore?.factors.treesFunded.rawValue ?? profile.totalTrees),
      speciesCount:
        simulateSpecies !== null
          ? Number(simulateSpecies)
          : (baseScore?.factors.speciesDiversity.rawValue ?? 0),
      regionsCount:
        simulateRegions !== null
          ? Number(simulateRegions)
          : (baseScore?.factors.geographicSpread.rawValue ?? 0),
      yearsOfEngagement:
        simulateYears !== null
          ? Number(simulateYears)
          : (baseScore?.factors.yearsOfEngagement.rawValue ?? 0),
    });

    return NextResponse.json({
      success: true,
      sponsorId: address,
      isSimulated: true,
      data: simulated,
    });
  }

  const scoreResult = getSponsorSocialImpactScore(address);
  if (!scoreResult) {
    return NextResponse.json(
      { success: false, error: 'Failed to compute impact score' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    sponsorId: address,
    isSimulated: false,
    data: scoreResult,
  });
}
