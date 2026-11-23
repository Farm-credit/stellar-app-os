/**
 * POST /api/v2/marketplace/listings/publish — Issue #1382
 *
 * Allow farmers and land managers to list carbon credits from verified projects.
 * Specify: credit type, quantity, price per ton, verification method.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  createAndPublishListing,
  getPublishedListings,
  ListingValidationError,
} from '@/lib/api/carbon-listing-publish';

export const runtime = 'nodejs';

function responseHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(): Promise<NextResponse> {
  const listings = await getPublishedListings();
  return NextResponse.json({ listings }, { headers: responseHeaders() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON.', issues: [] },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const listing = await createAndPublishListing(body);
    return NextResponse.json(listing, { status: 201, headers: responseHeaders() });
  } catch (error) {
    if (error instanceof ListingValidationError) {
      return NextResponse.json(
        { error: error.message, issues: error.issues },
        { status: 400, headers: responseHeaders() }
      );
    }
    console.error('[api/v2/marketplace/listings/publish] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
