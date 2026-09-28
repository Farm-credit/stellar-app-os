/**
 * POST /api/v2/marketplace/listings/publish — Issue #1382
 *
 * Allow farmers and land managers to list carbon credits from verified projects.
 * Specify: credit type, quantity, price per ton, verification method.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import {
  createAndPublishListing,
  getPublishedListings,
} from '@/lib/api/carbon-listing-publish';
import type { PublishListingRequest } from '@/lib/types/carbon-listing-publish';

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
  try {
    const body = (await request.json()) as PublishListingRequest;

    if (!body.projectId || !body.sellerAddress) {
      return NextResponse.json(
        { error: 'projectId and sellerAddress are required.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!body.quantityTonnes || body.quantityTonnes <= 0) {
      return NextResponse.json(
        { error: 'quantityTonnes must be a positive integer.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!body.pricePerTon || body.pricePerTon <= 0) {
      return NextResponse.json(
        { error: 'pricePerTon must be greater than zero.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!body.creditType) {
      return NextResponse.json(
        { error: 'creditType is required.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    if (!body.verificationMethod) {
      return NextResponse.json(
        { error: 'verificationMethod is required.' },
        { status: 400, headers: responseHeaders() }
      );
    }

    const listing = await createAndPublishListing(body);
    return NextResponse.json(listing, { status: 201, headers: responseHeaders() });
  } catch (error) {
    console.error('[api/v2/marketplace/listings/publish] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
