import { NextResponse } from 'next/server';
import {
  getPublishedListingById,
  updatePublishedListingPrice,
} from '@/lib/api/carbon-listing-publish';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { isAdminRequest } from '@/lib/auth/admin';
import { notifyPriceChanged } from '@/lib/webhook/offset-verification-bridge';

export const runtime = 'nodejs';

function mutationHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  let body: {
    pricePerTon?: unknown;
    sellerAddress?: unknown;
    reason?: unknown;
    transactionHash?: unknown;
    explorerUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: mutationHeaders() }
    );
  }

  const existing = await getPublishedListingById(id);
  if (!existing) {
    return NextResponse.json(
      { error: 'Listing not found' },
      { status: 404, headers: mutationHeaders() }
    );
  }

  const isAdmin = await isAdminRequest();
  const sellerHeader = request.headers.get('x-seller-address')?.trim();
  const sellerBody = typeof body.sellerAddress === 'string' ? body.sellerAddress.trim() : undefined;
  const callerSeller = sellerHeader || sellerBody;

  if (!isAdmin && (!callerSeller || callerSeller !== existing.sellerAddress)) {
    return NextResponse.json(
      { error: callerSeller ? 'Forbidden' : 'Unauthorized' },
      { status: callerSeller ? 403 : 401, headers: mutationHeaders() }
    );
  }

  const pricePerTon = Number(body.pricePerTon);
  if (!Number.isFinite(pricePerTon) || pricePerTon <= 0) {
    return NextResponse.json(
      { error: 'pricePerTon must be greater than zero.' },
      { status: 400, headers: mutationHeaders() }
    );
  }

  const result = await updatePublishedListingPrice({ id, pricePerTon });
  if (!result) {
    return NextResponse.json(
      { error: 'Listing not found' },
      { status: 404, headers: mutationHeaders() }
    );
  }

  if (result.changed) {
    void notifyPriceChanged({
      assetCode: `CARBON-${result.listing.projectId}-${result.listing.vintageYear}`,
      projectId: result.listing.projectId,
      currency: result.listing.currency || 'USD',
      previousPricePerTon: result.previousPricePerTon,
      pricePerTon: result.pricePerTon,
      reason: typeof body.reason === 'string' ? body.reason : null,
      transactionHash:
        typeof body.transactionHash === 'string'
          ? body.transactionHash
          : result.listing.transactionHash,
      explorerUrl: typeof body.explorerUrl === 'string' ? body.explorerUrl : null,
      changedAt: result.updatedAt,
    });
  }

  return NextResponse.json(
    {
      listing: result.listing,
      previousPricePerTon: result.previousPricePerTon,
      pricePerTon: result.pricePerTon,
      changed: result.changed,
      updatedAt: result.updatedAt,
    },
    { status: 200, headers: mutationHeaders() }
  );
}
