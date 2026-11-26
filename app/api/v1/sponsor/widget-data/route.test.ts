// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/v1/sponsor/widget-data', () => {
  it('returns 400 when sponsor query param is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/sponsor/widget-data');
    const res = await GET(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toMatch(/Missing required query parameter "sponsor"/i);
  });

  it('returns 200 with valid sponsor metrics and community rewards', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/sponsor/widget-data?sponsor=acme-corp');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.sponsor).toBeDefined();
    expect(json.sponsor.brandSlug).toBe('acme-corp');
    expect(json.metrics.fundedTreesCount).toBeGreaterThan(0);
    expect(json.communityRewards.carbonTokensDistributed).toBeGreaterThan(0);
    expect(json.communityRewards.nftCertificatesIssued).toBeGreaterThan(0);
    expect(json.network).toBe('testnet');
  });

  it('handles Stellar wallet public key addresses', async () => {
    const stellarAddress = 'GACME1111111111111111111111111111111111111111111111111111111';
    const req = new NextRequest(`http://localhost:3000/api/v1/sponsor/widget-data?sponsor=${stellarAddress}`);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.sponsor.walletAddress).toBe(stellarAddress);
    expect(json.sponsor.isVerifiedOnChain).toBe(true);
  });
});
