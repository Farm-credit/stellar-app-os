/**
 * Unit tests for the offset aggregation service — Issue #1426
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the test hermetic: `getSponsorImpact` only needs the kg-per-tree
// constant from this module, so the heavy Stellar SDK import is mocked out —
// the same approach as lib/api/__tests__/carbon-impact.test.ts.
vi.mock('@/lib/stellar/tree-asset', () => ({
  CO2_KG_PER_TREE: 48,
  TREE_ISSUER_TESTNET: 'G_MOCK_ISSUER',
  getTreeAsset: vi.fn(),
  getTreeExplorerUrl: vi.fn(),
  TREE_ISSUER_MAINNET: '',
  TREE_DISTRIBUTOR_TESTNET: '',
}));

import {
  OffsetAggregationError,
  aggregatePortfolioOffsets,
  normalizeOffsetPlatform,
  parseOffsetAggregationQuery,
  parseOffsetAggregationRequest,
  type PortfolioSource,
  type SourcePosition,
} from '@/lib/api/offset-aggregation';
import { cacheClear } from '@/lib/api/tree-registry-cache';

const VALID_ACCOUNT = 'GYNCXMBWLAVK7UJ6TI5SH4RG3QF2PEZODYNCXMBWLAVK7UJ6TI5SH4RG';

const ACTIVE_CREDIT: SourcePosition = {
  positionId: 'proj-001-2023',
  sourceId: 'stellar-credits',
  platform: 'verra',
  assetType: 'credit',
  projectId: 'proj-001',
  projectName: 'Amazon Rainforest Reforestation',
  quantityTonnes: 100,
  status: 'active',
  vintage: 2023,
  pricePerTon: 45.5,
  valueUsd: 4550,
  recordedAt: '2026-01-10T00:00:00.000Z',
};

const RETIRED_CREDIT: SourcePosition = {
  positionId: 'proj-005-2022-retired',
  sourceId: 'stellar-credits',
  platform: 'gold-standard',
  assetType: 'credit',
  projectId: 'proj-005',
  projectName: 'Sustainable Agriculture - Kenya',
  quantityTonnes: 40,
  status: 'retired',
  vintage: 2022,
  pricePerTon: 35,
  valueUsd: 1400,
  recordedAt: '2025-06-01T00:00:00.000Z',
  retirement: {
    retirementId: 'ret-1',
    retiredAt: '2025-06-01T00:00:00.000Z',
    beneficiary: 'portfolio-demo',
    transactionHash: 'tx-abc',
  },
};

const TREE_POSITION: SourcePosition = {
  positionId: 'tree-teak',
  sourceId: 'tree-registry',
  platform: 'tree-registry',
  assetType: 'sequestration',
  projectId: 'tree-teak',
  projectName: 'Teak tree sequestration',
  quantityTonnes: 1.2,
  status: 'active',
  recordedAt: '2026-02-01T00:00:00.000Z',
};

function createSource(id: string, positions: SourcePosition[]): PortfolioSource {
  return { id, label: id, loadPositions: async () => positions };
}

function createFailingSource(id: string, message = 'upstream unavailable'): PortfolioSource {
  return {
    id,
    label: id,
    loadPositions: async () => {
      throw new Error(message);
    },
  };
}

function defaultSources(): PortfolioSource[] {
  return [
    createSource('stellar-credits', [ACTIVE_CREDIT, RETIRED_CREDIT]),
    createSource('tree-registry', [TREE_POSITION]),
  ];
}

beforeEach(() => cacheClear());

// ── normalizeOffsetPlatform ───────────────────────────────────────────────────

describe('normalizeOffsetPlatform', () => {
  it('maps the repo verification statuses onto platforms', () => {
    expect(normalizeOffsetPlatform('Verra (VCS)')).toBe('verra');
    expect(normalizeOffsetPlatform('Gold Standard')).toBe('gold-standard');
    expect(normalizeOffsetPlatform('Climate Action Reserve')).toBe('climate-action-reserve');
    expect(normalizeOffsetPlatform('Plan Vivo')).toBe('plan-vivo');
  });

  it('falls back to unverified for pending/unknown standards', () => {
    expect(normalizeOffsetPlatform('Pending')).toBe('unverified');
    expect(normalizeOffsetPlatform(undefined)).toBe('unverified');
  });
});

// ── parseOffsetAggregationRequest ─────────────────────────────────────────────

describe('parseOffsetAggregationRequest', () => {
  it('accepts a minimal request', () => {
    const parsed = parseOffsetAggregationRequest({ portfolioId: 'portfolio-demo' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.portfolioId).toBe('portfolio-demo');
  });

  it('rejects a missing portfolioId', () => {
    const parsed = parseOffsetAggregationRequest({});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('portfolioId');
  });

  it('rejects a malformed Stellar account', () => {
    const parsed = parseOffsetAggregationRequest({
      portfolioId: 'portfolio-demo',
      account: 'not-a-key',
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('account');
  });

  it('rejects an unknown platform', () => {
    const parsed = parseOffsetAggregationRequest({
      portfolioId: 'portfolio-demo',
      platforms: ['not-a-platform'],
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects an invalid status', () => {
    const parsed = parseOffsetAggregationRequest({
      portfolioId: 'portfolio-demo',
      status: 'burned',
    });
    expect(parsed.ok).toBe(false);
  });

  it('rejects from > to', () => {
    const parsed = parseOffsetAggregationRequest({
      portfolioId: 'portfolio-demo',
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('to');
  });

  it('rejects a limit above the maximum', () => {
    const parsed = parseOffsetAggregationRequest({ portfolioId: 'portfolio-demo', limit: 5000 });
    expect(parsed.ok).toBe(false);
  });
});

// ── parseOffsetAggregationQuery ───────────────────────────────────────────────

describe('parseOffsetAggregationQuery', () => {
  it('parses comma-separated filters and coerces the limit', () => {
    const params = new URLSearchParams({
      portfolioId: 'portfolio-demo',
      platforms: 'verra, gold-standard',
      projectIds: 'proj-001,proj-004',
      status: 'retired',
      limit: '25',
    });

    const parsed = parseOffsetAggregationQuery(params);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.platforms).toEqual(['verra', 'gold-standard']);
      expect(parsed.data.projectIds).toEqual(['proj-001', 'proj-004']);
      expect(parsed.data.status).toBe('retired');
      expect(parsed.data.limit).toBe(25);
    }
  });

  it('supports the `portfolio` alias and reports a missing id', () => {
    expect(parseOffsetAggregationQuery(new URLSearchParams({ portfolio: 'x' })).ok).toBe(true);
    expect(parseOffsetAggregationQuery(new URLSearchParams()).ok).toBe(false);
  });
});

// ── aggregatePortfolioOffsets ─────────────────────────────────────────────────

describe('aggregatePortfolioOffsets', () => {
  it('aggregates totals and breakdowns across sources', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo' },
      { sources: defaultSources() }
    );

    expect(summary.totals).toEqual({
      positionCount: 3,
      projectCount: 3,
      platformCount: 3,
      totalTonnes: 141.2,
      activeTonnes: 101.2,
      retiredTonnes: 40,
      totalValueUsd: 5950,
      retirementCount: 1,
    });

    expect(summary.byPlatform.map((entry) => entry.platform)).toEqual([
      'verra',
      'gold-standard',
      'tree-registry',
    ]);
    expect(summary.byPlatform[0]).toMatchObject({
      platform: 'verra',
      positionCount: 1,
      projectCount: 1,
      totalTonnes: 100,
      totalValueUsd: 4550,
    });

    expect(summary.byProject.map((entry) => entry.projectId)).toEqual([
      'proj-001',
      'proj-005',
      'tree-teak',
    ]);

    expect(summary.sources.every((source) => source.status === 'ok')).toBe(true);
    expect(summary.invalidPositionCount).toBe(0);
  });

  it('returns retirements sorted by date and exposes the ledger', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo' },
      { sources: defaultSources() }
    );

    expect(summary.retirements).toHaveLength(1);
    expect(summary.retirements[0]).toMatchObject({
      retirementId: 'ret-1',
      platform: 'gold-standard',
      projectId: 'proj-005',
      quantityTonnes: 40,
      transactionHash: 'tx-abc',
    });
  });

  it('sorts positions by recordedAt descending', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo' },
      { sources: defaultSources() }
    );

    expect(summary.positions.map((position) => position.positionId)).toEqual([
      'tree-teak',
      'proj-001-2023',
      'proj-005-2022-retired',
    ]);
  });

  it('filters by status', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo', status: 'retired' },
      { sources: defaultSources() }
    );

    expect(summary.totals.positionCount).toBe(1);
    expect(summary.totals.retiredTonnes).toBe(40);
    expect(summary.totals.activeTonnes).toBe(0);
    expect(summary.filters.status).toBe('retired');
  });

  it('filters by platform and project id', async () => {
    const byPlatform = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo', platforms: ['verra'] },
      { sources: defaultSources() }
    );
    expect(byPlatform.totals.positionCount).toBe(1);
    expect(byPlatform.byPlatform).toHaveLength(1);

    const byProject = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo', projectIds: ['proj-005', 'tree-teak'] },
      { sources: defaultSources() }
    );
    expect(byProject.totals.positionCount).toBe(2);
  });

  it('filters by date range on recordedAt', async () => {
    const summary = await aggregatePortfolioOffsets(
      {
        portfolioId: 'portfolio-demo',
        from: '2025-01-01T00:00:00.000Z',
        to: '2025-12-31T23:59:59.999Z',
      },
      { sources: defaultSources() }
    );

    expect(summary.totals.positionCount).toBe(1);
    expect(summary.positions[0].positionId).toBe('proj-005-2022-retired');
  });

  it('caps the positions list with limit but keeps full totals', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo', limit: 1 },
      { sources: defaultSources() }
    );

    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0].positionId).toBe('tree-teak');
    expect(summary.totals.positionCount).toBe(3);
    expect(summary.filters.limit).toBe(1);
  });

  it('tolerates a partial source failure', async () => {
    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo' },
      {
        sources: [
          createSource('stellar-credits', [ACTIVE_CREDIT]),
          createFailingSource('tree-registry'),
        ],
      }
    );

    expect(summary.totals.positionCount).toBe(1);
    expect(summary.sources).toEqual([
      {
        sourceId: 'stellar-credits',
        label: 'stellar-credits',
        status: 'ok',
        positionCount: 1,
      },
      {
        sourceId: 'tree-registry',
        label: 'tree-registry',
        status: 'error',
        positionCount: 0,
        error: 'upstream unavailable',
      },
    ]);
  });

  it('throws when every source fails', async () => {
    await expect(
      aggregatePortfolioOffsets(
        { portfolioId: 'portfolio-demo' },
        { sources: [createFailingSource('a'), createFailingSource('b')] }
      )
    ).rejects.toBeInstanceOf(OffsetAggregationError);
  });

  it('skips malformed positions and reports the count', async () => {
    const malformed: SourcePosition = { ...ACTIVE_CREDIT, positionId: 'bad', quantityTonnes: NaN };

    const summary = await aggregatePortfolioOffsets(
      { portfolioId: 'portfolio-demo' },
      { sources: [createSource('stellar-credits', [malformed])] }
    );

    expect(summary.invalidPositionCount).toBe(1);
    expect(summary.totals.positionCount).toBe(0);
  });

  it('aggregates the default sources over real repo data', async () => {
    const summary = await aggregatePortfolioOffsets({
      portfolioId: 'portfolio-demo',
      account: VALID_ACCOUNT,
    });

    expect(summary.sources.map((source) => source.sourceId)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
    expect(summary.byPlatform.some((entry) => entry.platform === 'tree-registry')).toBe(true);
    expect(summary.totals.totalTonnes).toBeGreaterThan(0);
    expect(summary.portfolioId).toBe('portfolio-demo');
    expect(summary.account).toBe(VALID_ACCOUNT);
  });
});
