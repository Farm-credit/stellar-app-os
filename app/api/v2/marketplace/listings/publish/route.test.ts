import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { resetPublishedListings } from '@/lib/api/carbon-listing-publish';

const SELLER = 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z';

function post(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/v2/marketplace/listings/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const valid = {
  projectId: 'GS-4820',
  projectName: 'Rift Valley Smallholder Agroforestry & Carbon Sink',
  sellerAddress: SELLER,
  landManagerName: 'Highland Carbon Stewards',
  creditType: 'Agroforestry & Silvopasture',
  quantityTonnes: 250,
  pricePerTon: 28,
  currency: 'USD',
  verificationMethod: 'Gold Standard',
  vintageYear: 2024,
};

describe('POST /api/v2/marketplace/listings/publish', () => {
  beforeEach(() => resetPublishedListings());

  it('creates a listing and returns 201', async () => {
    const res = await POST(post(valid));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('published');
    const listRes = await GET();
    expect((await listRes.json()).listings).toHaveLength(1);
  });

  it('returns 400 with issues for invalid input', async () => {
    const res = await POST(post({ ...valid, quantityTonnes: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('returns 400 for an unverified project', async () => {
    const res = await POST(post({ ...valid, projectId: 'NOPE' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await POST(post('{not json', true));
    expect(res.status).toBe(400);
  });
});
