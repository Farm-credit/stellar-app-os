/**
 * Route tests for GET/POST /api/v2/portfolio/offsets — Issue #1426
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic default sources: `getSponsorImpact` only needs CO2_KG_PER_TREE from
// this module, so the heavy Stellar SDK import is mocked out.
vi.mock('@/lib/stellar/tree-asset', () => ({
  CO2_KG_PER_TREE: 48,
  TREE_ISSUER_TESTNET: 'G_MOCK_ISSUER',
  getTreeAsset: vi.fn(),
  getTreeExplorerUrl: vi.fn(),
  TREE_ISSUER_MAINNET: '',
  TREE_DISTRIBUTOR_TESTNET: '',
}));

import { GET, POST } from './route';
import { cacheClear } from '@/lib/api/tree-registry-cache';

const URL_BASE = 'http://localhost:3000/api/v2/portfolio/offsets';
const VALID_ACCOUNT = 'GYNCXMBWLAVK7UJ6TI5SH4RG3QF2PEZODYNCXMBWLAVK7UJ6TI5SH4RG';

function getRequest(query = ''): Request {
  return new Request(`${URL_BASE}${query}`);
}

function postRequest(body: unknown, raw = false): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => cacheClear());

describe('GET /api/v2/portfolio/offsets', () => {
  it('returns 400 when portfolioId is missing', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid offset aggregation request');
    expect(body.details.join(' ')).toContain('portfolioId');
  });

  it('returns 400 for a malformed account', async () => {
    const response = await GET(getRequest('?portfolioId=demo&account=nope'));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an unknown platform', async () => {
    const response = await GET(getRequest('?portfolioId=demo&platforms=acme-registry'));
    expect(response.status).toBe(400);
  });

  it('aggregates the portfolio and stamps the version header', async () => {
    const response = await GET(getRequest(`?portfolioId=demo&account=${VALID_ACCOUNT}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(response.headers.get('Cache-Control')).toContain('no-store');

    expect(body.portfolioId).toBe('demo');
    expect(body.account).toBe(VALID_ACCOUNT);
    expect(body.totals.positionCount).toBeGreaterThan(0);

    const platforms = body.byPlatform.map((entry: { platform: string }) => entry.platform);
    expect(platforms).toContain('tree-registry');

    expect(body.sources.map((source: { sourceId: string }) => source.sourceId)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
  });

  it('applies a status filter from the query string', async () => {
    const response = await GET(getRequest('?portfolioId=demo&status=retired'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters.status).toBe('retired');
    expect(body.totals.activeTonnes).toBe(0);
  });
});

describe('POST /api/v2/portfolio/offsets', () => {
  it('returns 400 for an invalid JSON body', async () => {
    const response = await POST(postRequest('{not json', true));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 when the body fails validation', async () => {
    const response = await POST(postRequest({ platforms: ['verra'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details.join(' ')).toContain('portfolioId');
  });

  it('aggregates the portfolio from a JSON body', async () => {
    const response = await POST(
      postRequest({
        portfolioId: 'demo',
        account: VALID_ACCOUNT,
        platforms: ['tree-registry'],
        status: 'active',
        limit: 10,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters.platforms).toEqual(['tree-registry']);
    expect(body.filters.limit).toBe(10);
    expect(body.byPlatform).toHaveLength(1);
    expect(body.byPlatform[0].platform).toBe('tree-registry');
  });
});
