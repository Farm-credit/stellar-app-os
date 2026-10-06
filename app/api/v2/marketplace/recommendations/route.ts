/**
 * POST /api/v2/marketplace/recommendations — Issue #1306
 *
 * Returns offset projects ranked for a buyer profile (industry, company size,
 * past purchases, co-benefit preferences and budget). Scoring lives in
 * `lib/marketplace/buyerRecommendations.ts` so the UI and API agree.
 *
 * Closes #1306
 */

import { NextResponse } from 'next/server';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { parseBuyerProfile, recommendProjects } from '@/lib/marketplace/buyerRecommendations';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body must be JSON' },
      { status: 400 }
    );
  }

  const parsed = parseBuyerProfile(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, error: 'Invalid buyer profile', details: parsed.errors },
      { status: 400 }
    );
  }

  const requestedLimit = Number((body as { limit?: unknown }).limit ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
    : DEFAULT_LIMIT;

  const result = recommendProjects(parsed.profile, mockCarbonProjects, limit);
  return NextResponse.json({ success: true, profile: parsed.profile, ...result });
}
