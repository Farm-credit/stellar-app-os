import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest: vi.fn() }));
vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyPriceChanged: vi.fn(() => Promise.resolve([])),
}));

import { createAndPublishListing, resetPublishedListings } from '@/lib/api/carbon-listing-publish';
import { isAdminRequest } from '@/lib/auth/admin';
import { notifyPriceChanged } from '@/lib/webhook/offset-verification-bridge';
import { PATCH } from './route';

const SELLER = 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z';

const mockedAdmin = vi.mocked(isAdminRequest);
const mockedNotifyPrice = vi.mocked(notifyPriceChanged);

beforeEach(() => {
  vi.clearAllMocks();
  resetPublishedListings();
  mockedAdmin.mockResolvedValue(false);
});

describe('PATCH /api/v2/marketplace/listings/[id]', () => {
  it('requires seller or admin authorization and emits price.changed when price changes', async () => {
    const listing = await createAndPublishListing({
      projectId: 'VCS-1940',
      projectName: 'East Africa Community Reforestation & Soil Sequestration',
      sellerAddress: SELLER,
      landManagerName: 'Highland Carbon Stewards',
      quantityTonnes: 100,
      pricePerTon: 25,
      currency: 'USD',
      creditType: 'Reforestation & Afforestation',
      verificationMethod: 'Verra (VCS)',
      vintageYear: 2024,
    });

    const unauth = await PATCH(
      new Request(`https://app.example/api/v2/marketplace/listings/${listing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pricePerTon: 30 }),
      }),
      { params: Promise.resolve({ id: listing.id }) }
    );
    expect(unauth.status).toBe(401);

    const forbidden = await PATCH(
      new Request(`https://app.example/api/v2/marketplace/listings/${listing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pricePerTon: 30, sellerAddress: 'GOTHER' }),
      }),
      { params: Promise.resolve({ id: listing.id }) }
    );
    expect(forbidden.status).toBe(403);

    const ok = await PATCH(
      new Request(`https://app.example/api/v2/marketplace/listings/${listing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pricePerTon: 30, sellerAddress: SELLER, reason: 'Repricing' }),
      }),
      { params: Promise.resolve({ id: listing.id }) }
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(mockedNotifyPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'VCS-1940',
        previousPricePerTon: 25,
        pricePerTon: 30,
      })
    );
  });
});
