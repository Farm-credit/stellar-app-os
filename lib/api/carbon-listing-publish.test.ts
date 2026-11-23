import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAndPublishListing,
  getPublishedListings,
  listedTonnesForProject,
  ListingValidationError,
  resetPublishedListings,
} from '@/lib/api/carbon-listing-publish';

const SELLER = 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z';

function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projectId: 'VCS-1940',
    projectName: 'East Africa Community Reforestation & Soil Sequestration',
    sellerAddress: SELLER,
    landManagerName: 'Highland Carbon Stewards',
    creditType: 'Reforestation & Afforestation',
    quantityTonnes: 500,
    pricePerTon: 24.5,
    currency: 'USD',
    verificationMethod: 'Verra (VCS)',
    vintageYear: 2024,
    ...overrides,
  };
}

async function issuesFor(input: unknown): Promise<string[]> {
  try {
    await createAndPublishListing(input);
  } catch (error) {
    if (error instanceof ListingValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe('carbon listing publish', () => {
  beforeEach(() => resetPublishedListings());

  it('publishes a listing with credit type, quantity, price and verification method', async () => {
    const listing = await createAndPublishListing(validRequest());
    expect(listing).toMatchObject({
      projectId: 'VCS-1940',
      creditType: 'Reforestation & Afforestation',
      quantityTonnes: 500,
      availableTonnes: 500,
      pricePerTon: 24.5,
      verificationMethod: 'Verra (VCS)',
      status: 'published',
      registryReferenceId: 'VERRAVCS-VCS-1940',
    });
    expect(await getPublishedListings()).toHaveLength(1);
  });

  it('rejects projects that are not verified', async () => {
    const issues = await issuesFor(validRequest({ projectId: 'UNKNOWN-1' }));
    expect(issues.join(' ')).toMatch(/not a verified carbon project/);
  });

  it('rejects a verification method that differs from the project registration', async () => {
    const issues = await issuesFor(validRequest({ verificationMethod: 'Gold Standard' }));
    expect(issues.join(' ')).toMatch(/verified under Verra \(VCS\)/);
  });

  it('rejects malformed seller addresses', async () => {
    expect(
      (await issuesFor(validRequest({ sellerAddress: 'not-an-address' }))).length
    ).toBeGreaterThan(0);
  });

  it('rejects zero, negative and fractional quantities', async () => {
    for (const quantityTonnes of [0, -5, 1.5]) {
      expect((await issuesFor(validRequest({ quantityTonnes }))).length).toBeGreaterThan(0);
    }
  });

  it('rejects non-positive prices and unknown credit types', async () => {
    expect((await issuesFor(validRequest({ pricePerTon: 0 }))).length).toBeGreaterThan(0);
    expect((await issuesFor(validRequest({ creditType: 'Magic Beans' }))).length).toBeGreaterThan(
      0
    );
  });

  it('caps total listed tonnes at the project verified supply', async () => {
    await createAndPublishListing(validRequest({ quantityTonnes: 108_000 }));
    expect(listedTonnesForProject('VCS-1940')).toBe(108_000);
    const issues = await issuesFor(validRequest({ quantityTonnes: 1 }));
    expect(issues.join(' ')).toMatch(/only 0 verified tonnes remain/);
  });

  it('lists newest first', async () => {
    const first = await createAndPublishListing(validRequest({ quantityTonnes: 10 }));
    const second = await createAndPublishListing(validRequest({ quantityTonnes: 20 }));
    const listings = await getPublishedListings();
    expect(listings.map((l) => l.id)).toEqual([second.id, first.id]);
  });
});
