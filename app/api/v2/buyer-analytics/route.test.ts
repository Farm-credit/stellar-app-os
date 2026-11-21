/**
 * Route tests for GET/POST /api/v2/buyer-analytics — Issue #1413
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic default sources: the tree source only needs CO2_KG_PER_TREE from
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

const URL_BASE = 'http://localhost:3000/api/v2/buyer-analytics';
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

describe('GET /api/v2/buyer-analytics', () => {
  it('returns 400 when buyerId is missing', async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid buyer analytics request');
    expect(body.details.join(' ')).toContain('buyerId');
  });

  it('returns 400 for a malformed account', async () => {
    const response = await GET(getRequest('?buyerId=demo&account=nope'));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an unknown platform, interval, or data source', async () => {
    expect((await GET(getRequest('?buyerId=demo&platforms=acme-registry'))).status).toBe(400);
    expect((await GET(getRequest('?buyerId=demo&interval=week'))).status).toBe(400);
    expect((await GET(getRequest('?buyerId=demo&dataSource=bank'))).status).toBe(400);
  });

  it('keeps the synthetic feeds as the default and echoes the requested source', async () => {
    const response = await GET(getRequest(`?buyerId=demo&dataSource=synthetic`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters.dataSource).toBe('synthetic');
    expect(body.sourceStatuses.map((source: { sourceId: string }) => source.sourceId)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
  });

  it('aggregates the dashboard and stamps the version header', async () => {
    const response = await GET(getRequest(`?buyerId=demo&account=${VALID_ACCOUNT}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');
    expect(response.headers.get('Cache-Control')).toContain('no-store');

    expect(body.buyerId).toBe('demo');
    expect(body.account).toBe(VALID_ACCOUNT);
    expect(body.totals.totalTonnes).toBeGreaterThan(0);
    expect(body.totals.costPerTonUsd).toBeGreaterThan(0);

    expect(body.supplyChain.length).toBeGreaterThan(0);
    expect(body.trends.interval).toBe('month');
    expect(body.sourceStatuses.map((source: { sourceId: string }) => source.sourceId)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
  });

  it('applies a status filter and interval from the query string', async () => {
    const response = await GET(getRequest('?buyerId=demo&status=retired&interval=quarter'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters.status).toBe('retired');
    expect(body.totals.activeTonnes).toBe(0);
    expect(body.trends.interval).toBe('quarter');
  });
});

describe('POST /api/v2/buyer-analytics', () => {
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
    expect(body.details.join(' ')).toContain('buyerId');
  });

  it('aggregates the dashboard from a JSON body', async () => {
    const response = await POST(
      postRequest({
        buyerId: 'demo',
        account: VALID_ACCOUNT,
        platforms: ['tree-registry'],
        status: 'active',
        interval: 'quarter',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.filters.platforms).toEqual(['tree-registry']);
    expect(body.trends.interval).toBe('quarter');
    expect(
      body.supplyChain.every((p: { platform: string }) => p.platform === 'tree-registry')
    ).toBe(true);
  });
});
