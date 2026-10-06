/**
 * Unit tests for the buyer analytics service — Issue #1413
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the test hermetic: the default tree source goes through
// `getSponsorImpact`, which only needs the kg-per-tree constant from this
// module, so the heavy Stellar SDK import is mocked out — matching
// lib/api/__tests__/offset-aggregation.test.ts.
vi.mock('@/lib/stellar/tree-asset', () => ({
  CO2_KG_PER_TREE: 48,
  TREE_ISSUER_TESTNET: 'G_MOCK_ISSUER',
  getTreeAsset: vi.fn(),
  getTreeExplorerUrl: vi.fn(),
  TREE_ISSUER_MAINNET: '',
  TREE_DISTRIBUTOR_TESTNET: '',
}));

import {
  BuyerAnalyticsError,
  aggregateBuyerAnalytics,
  parseBuyerAnalyticsQuery,
  parseBuyerAnalyticsRequest,
  resolveBuyerAnalyticsSources,
} from '@/lib/api/buyer-analytics';
import { cacheClear } from '@/lib/api/tree-registry-cache';
import {
  DEFAULT_PORTFOLIO_SOURCES,
  type PortfolioSource,
  type SourcePosition,
} from '@/lib/api/offset-aggregation';

const VALID_ACCOUNT = 'GYNCXMBWLAVK7UJ6TI5SH4RG3QF2PEZODYNCXMBWLAVK7UJ6TI5SH4RG';
const FROZEN_NOW = new Date('2026-03-01T00:00:00.000Z');

const ACTIVE_CREDIT: SourcePosition = {
  positionId: 'proj-001-2023',
  sourceId: 'stellar-credits',
  platform: 'gold-standard',
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
  positionId: 'proj-002-2024-retired',
  sourceId: 'stellar-credits',
  platform: 'verra',
  assetType: 'credit',
  projectId: 'proj-002',
  projectName: 'Wind Energy Farm - Texas',
  quantityTonnes: 40,
  status: 'retired',
  vintage: 2024,
  pricePerTon: 38.25,
  valueUsd: 1530,
  recordedAt: '2026-01-05T00:00:00.000Z',
  retirement: {
    retirementId: 'ret-proj-002',
    retiredAt: '2026-01-20T00:00:00.000Z',
    beneficiary: 'buyer-demo',
    transactionHash: 'tx-def',
  },
};

const FEB_CREDIT: SourcePosition = {
  positionId: 'proj-001-2023-b',
  sourceId: 'stellar-credits',
  platform: 'gold-standard',
  assetType: 'credit',
  projectId: 'proj-001',
  projectName: 'Amazon Rainforest Reforestation',
  quantityTonnes: 50,
  status: 'active',
  vintage: 2023,
  pricePerTon: 45.5,
  valueUsd: 2275,
  recordedAt: '2026-02-08T00:00:00.000Z',
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
  return { id, label: id, loadPositions: () => Promise.resolve(positions) };
}

function createFailingSource(id: string, message = 'upstream unavailable'): PortfolioSource {
  return {
    id,
    label: id,
    loadPositions: () => Promise.reject(new Error(message)),
  };
}

function defaultSources(): PortfolioSource[] {
  return [
    createSource('stellar-credits', [ACTIVE_CREDIT, RETIRED_CREDIT, FEB_CREDIT]),
    createSource('tree-registry', [TREE_POSITION]),
  ];
}

function aggregate(overrides: Partial<Parameters<typeof aggregateBuyerAnalytics>[0]> = {}) {
  return aggregateBuyerAnalytics(
    { buyerId: 'buyer-demo', ...overrides },
    { sources: defaultSources(), now: FROZEN_NOW }
  );
}

beforeEach(() => cacheClear());

// ── parseBuyerAnalyticsRequest ────────────────────────────────────────────────

describe('parseBuyerAnalyticsRequest', () => {
  it('accepts a minimal request', () => {
    const parsed = parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.buyerId).toBe('buyer-demo');
  });

  it('rejects a missing buyerId', () => {
    const parsed = parseBuyerAnalyticsRequest({});
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('buyerId');
  });

  it('rejects a malformed Stellar account', () => {
    const parsed = parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo', account: 'not-a-key' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('account');
  });

  it('rejects an unknown platform and an invalid interval', () => {
    expect(
      parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo', platforms: ['not-a-platform'] }).ok
    ).toBe(false);
    expect(parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo', interval: 'week' }).ok).toBe(false);
  });

  it('rejects an unknown data source and accepts the known ones', () => {
    expect(parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo', dataSource: 'sql' }).ok).toBe(false);
    for (const dataSource of ['synthetic', 'ledger', 'all']) {
      const parsed = parseBuyerAnalyticsRequest({ buyerId: 'buyer-demo', dataSource });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.data.dataSource).toBe(dataSource);
    }
  });

  it('rejects from > to', () => {
    const parsed = parseBuyerAnalyticsRequest({
      buyerId: 'buyer-demo',
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(' ')).toContain('to');
  });
});

// ── parseBuyerAnalyticsQuery ──────────────────────────────────────────────────

describe('parseBuyerAnalyticsQuery', () => {
  it('parses comma-separated filters and the interval', () => {
    const params = new URLSearchParams({
      buyerId: 'buyer-demo',
      platforms: 'gold-standard, verra',
      projectIds: 'proj-001,proj-002',
      status: 'retired',
      interval: 'quarter',
    });

    const parsed = parseBuyerAnalyticsQuery(params);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.platforms).toEqual(['gold-standard', 'verra']);
      expect(parsed.data.projectIds).toEqual(['proj-001', 'proj-002']);
      expect(parsed.data.status).toBe('retired');
      expect(parsed.data.interval).toBe('quarter');
    }
  });

  it('supports the `buyer` alias and reports a missing id', () => {
    expect(parseBuyerAnalyticsQuery(new URLSearchParams({ buyer: 'x' })).ok).toBe(true);
    expect(parseBuyerAnalyticsQuery(new URLSearchParams()).ok).toBe(false);
  });

  it('parses and rejects the data source', () => {
    const parsed = parseBuyerAnalyticsQuery(
      new URLSearchParams({ buyerId: 'buyer-demo', dataSource: 'ledger' })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.dataSource).toBe('ledger');

    expect(
      parseBuyerAnalyticsQuery(new URLSearchParams({ buyerId: 'buyer-demo', dataSource: 'bank' })).ok
    ).toBe(false);
  });
});

// ── resolveBuyerAnalyticsSources ──────────────────────────────────────────────

describe('resolveBuyerAnalyticsSources', () => {
  it('keeps the synthetic feeds as the default and only reads the ledger on request', () => {
    expect(resolveBuyerAnalyticsSources().map((source) => source.id)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
    expect(resolveBuyerAnalyticsSources('synthetic')).toEqual(DEFAULT_PORTFOLIO_SOURCES);
    expect(resolveBuyerAnalyticsSources('ledger').map((source) => source.id)).toEqual([
      'buyer-ledger',
    ]);
    expect(resolveBuyerAnalyticsSources('all').map((source) => source.id)).toEqual([
      'stellar-credits',
      'tree-registry',
      'buyer-ledger',
    ]);
  });
});

// ── aggregateBuyerAnalytics ───────────────────────────────────────────────────

describe('aggregateBuyerAnalytics — totals', () => {
  it('aggregates purchased offset totals and the effective cost per tonne', async () => {
    const summary = await aggregate();

    expect(summary.totals).toEqual({
      purchaseCount: 4,
      projectCount: 3,
      totalTonnes: 191.2,
      creditTonnes: 190,
      sequestrationTonnes: 1.2,
      activeTonnes: 151.2,
      retiredTonnes: 40,
      totalCostUsd: 8355,
      pricedTonnes: 190,
      costPerTonUsd: 43.97,
      minCostPerTonUsd: 38.25,
      maxCostPerTonUsd: 45.5,
      costByCurrency: [{ currency: 'USD', tonnes: 190, cost: 8355, costPerTon: 43.97 }],
      retirementCount: 1,
    });

    expect(summary.buyerId).toBe('buyer-demo');
    expect(summary.generatedAt).toBe(FROZEN_NOW.toISOString());
    expect(summary.invalidPositionCount).toBe(0);
    expect(summary.sourceStatuses.every((source) => source.status === 'ok')).toBe(true);
  });

  it('reports the account and filter defaults', async () => {
    const summary = await aggregate({ account: VALID_ACCOUNT });
    expect(summary.account).toBe(VALID_ACCOUNT);
    expect(summary.filters).toEqual({
      platforms: null,
      projectIds: null,
      status: 'all',
      from: null,
      to: null,
      interval: 'month',
      dataSource: 'synthetic',
    });
  });
});

describe('aggregateBuyerAnalytics — co-benefits', () => {
  it('aggregates co-benefits across purchased projects', async () => {
    const summary = await aggregate();

    const biodiversity = summary.coBenefits.find((entry) => entry.name === 'Biodiversity');
    expect(biodiversity).toMatchObject({
      projectCount: 1,
      tonnes: 150,
      sharePercentage: 78.45,
    });

    const cleanEnergy = summary.coBenefits.find((entry) => entry.name === 'Clean Energy');
    expect(cleanEnergy).toMatchObject({
      projectCount: 1,
      tonnes: 40,
      sharePercentage: 20.92,
    });

    // Sorted by tonnes descending.
    expect(summary.coBenefits[0].name).toBe('Biodiversity');
    expect(summary.coBenefits[0].tonnes).toBeGreaterThanOrEqual(
      summary.coBenefits[summary.coBenefits.length - 1].tonnes
    );
  });
});

describe('aggregateBuyerAnalytics — supply chain', () => {
  it('returns a per-project chain of custody ordered by tonnes', async () => {
    const summary = await aggregate();

    expect(summary.supplyChain.map((project) => project.projectId)).toEqual([
      'proj-001',
      'proj-002',
      'tree-teak',
    ]);

    const amazon = summary.supplyChain[0];
    expect(amazon).toMatchObject({
      tonnes: 150,
      retiredTonnes: 0,
      costUsd: 6825,
      costPerTonUsd: 45.5,
      projectType: 'Reforestation',
      vintages: [2023],
    });
    expect(amazon.coBenefits).toContain('Biodiversity');

    const stages = Object.fromEntries(amazon.stages.map((stage) => [stage.stage, stage] as const));
    expect(stages.issuance.status).toBe('complete');
    expect(stages.issuance.at).toBe('2023-01-01T00:00:00.000Z');
    expect(stages.verification.status).toBe('complete');
    expect(stages.purchase.status).toBe('complete');
    expect(stages.retirement.status).toBe('pending');
  });

  it('marks a fully retired credit position as retired and sequestration as not-applicable', async () => {
    const summary = await aggregate();

    const wind = summary.supplyChain.find((project) => project.projectId === 'proj-002');
    const windRetirement = wind?.stages.find((stage) => stage.stage === 'retirement');
    expect(windRetirement?.status).toBe('complete');
    expect(windRetirement?.at).toBe('2026-01-20T00:00:00.000Z');

    const tree = summary.supplyChain.find((project) => project.projectId === 'tree-teak');
    const treeRetirement = tree?.stages.find((stage) => stage.stage === 'retirement');
    expect(treeRetirement?.status).toBe('not-applicable');
    expect(tree?.assetType).toBe('sequestration');
    expect(tree?.coBenefits).toEqual([]);

    const issuance = tree?.stages.find((stage) => stage.stage === 'issuance');
    expect(issuance?.status).toBe('pending');
  });
});

describe('aggregateBuyerAnalytics — trends', () => {
  it('buckets purchases by month and computes direction', async () => {
    const summary = await aggregate();

    expect(summary.trends.interval).toBe('month');
    expect(summary.trends.points.map((point) => point.period)).toEqual(['2026-01', '2026-02']);

    expect(summary.trends.points[0]).toEqual({
      period: '2026-01',
      label: 'Jan 2026',
      purchaseCount: 2,
      tonnes: 140,
      costUsd: 6080,
      costPerTonUsd: 43.43,
      costByCurrency: [{ currency: 'USD', tonnes: 140, cost: 6080, costPerTon: 43.43 }],
    });

    expect(summary.trends.points[1]).toMatchObject({
      period: '2026-02',
      tonnes: 51.2,
      costUsd: 2275,
      costPerTonUsd: 45.5,
    });

    expect(summary.trends.direction).toBe('down');
    expect(summary.trends.tonnesChangePercentage).toBe(-63.43);
    expect(summary.trends.costPerTonChangePercentage).toBe(4.77);
  });

  it('supports quarterly buckets with a flat direction for a single period', async () => {
    const summary = await aggregate({ interval: 'quarter' });

    expect(summary.trends.interval).toBe('quarter');
    expect(summary.trends.points).toHaveLength(1);
    expect(summary.trends.points[0]).toMatchObject({
      period: '2026-Q1',
      label: 'Q1 2026',
      tonnes: 191.2,
      costUsd: 8355,
      costPerTonUsd: 43.97,
    });
    expect(summary.trends.direction).toBe('flat');
    expect(summary.trends.tonnesChangePercentage).toBe(0);
  });
});

describe('aggregateBuyerAnalytics — filters', () => {
  it('filters by status', async () => {
    const summary = await aggregate({ status: 'retired' });

    expect(summary.totals.purchaseCount).toBe(1);
    expect(summary.totals.retiredTonnes).toBe(40);
    expect(summary.totals.activeTonnes).toBe(0);
    expect(summary.filters.status).toBe('retired');
  });

  it('filters by platform and project id', async () => {
    const byPlatform = await aggregate({ platforms: ['gold-standard'] });
    expect(byPlatform.totals.purchaseCount).toBe(2);
    expect(byPlatform.supplyChain).toHaveLength(1);

    const byProject = await aggregate({ projectIds: ['proj-002', 'tree-teak'] });
    expect(byProject.totals.purchaseCount).toBe(2);
    expect(byProject.totals.totalTonnes).toBe(41.2);
  });

  it('filters by date range on recordedAt', async () => {
    const summary = await aggregate({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-28T23:59:59.999Z',
    });

    expect(summary.totals.purchaseCount).toBe(2);
    expect(summary.supplyChain.map((project) => project.projectId)).toEqual([
      'proj-001',
      'tree-teak',
    ]);
  });
});

describe('aggregateBuyerAnalytics — robustness', () => {
  it('produces an empty but valid summary when nothing matches', async () => {
    const summary = await aggregate({ projectIds: ['does-not-exist'] });

    expect(summary.totals.totalTonnes).toBe(0);
    expect(summary.totals.costPerTonUsd).toBe(0);
    expect(summary.coBenefits).toEqual([]);
    expect(summary.supplyChain).toEqual([]);
    expect(summary.trends.points).toEqual([]);
  });

  it('tolerates a partial source failure', async () => {
    const summary = await aggregateBuyerAnalytics(
      { buyerId: 'buyer-demo' },
      {
        sources: [
          createSource('stellar-credits', [ACTIVE_CREDIT]),
          createFailingSource('tree-registry'),
        ],
        now: FROZEN_NOW,
      }
    );

    expect(summary.totals.purchaseCount).toBe(1);
    expect(summary.sourceStatuses[1]).toEqual({
      sourceId: 'tree-registry',
      label: 'tree-registry',
      status: 'error',
      positionCount: 0,
      error: 'upstream unavailable',
    });
  });

  it('throws when every source fails', async () => {
    await expect(
      aggregateBuyerAnalytics(
        { buyerId: 'buyer-demo' },
        { sources: [createFailingSource('a'), createFailingSource('b')], now: FROZEN_NOW }
      )
    ).rejects.toBeInstanceOf(BuyerAnalyticsError);
  });

  it('skips malformed positions and reports the count', async () => {
    const malformed: SourcePosition = {
      ...ACTIVE_CREDIT,
      positionId: 'bad',
      quantityTonnes: Number.NaN,
    };

    const summary = await aggregateBuyerAnalytics(
      { buyerId: 'buyer-demo' },
      { sources: [createSource('stellar-credits', [malformed])], now: FROZEN_NOW }
    );

    expect(summary.invalidPositionCount).toBe(1);
    expect(summary.totals.purchaseCount).toBe(0);
  });

  it('reports a partly retired lot by its real retired tonnage', async () => {
    const partial: SourcePosition = {
      positionId: 'purchase:lot-1',
      sourceId: 'buyer-ledger',
      platform: 'gold-standard',
      assetType: 'credit',
      projectId: 'proj-001',
      projectName: 'Amazon Rainforest Reforestation',
      quantityTonnes: 100,
      status: 'active',
      valueUsd: 4550,
      currency: 'USD',
      retiredTonnes: 30,
      recordedAt: '2026-01-10T00:00:00.000Z',
      retirement: {
        retirementId: 'ret-1',
        retiredAt: '2026-01-20T00:00:00.000Z',
      },
    };

    const summary = await aggregateBuyerAnalytics(
      { buyerId: 'buyer-demo' },
      { sources: [createSource('buyer-ledger', [partial])], now: FROZEN_NOW }
    );

    expect(summary.totals.retiredTonnes).toBe(30);
    expect(summary.totals.activeTonnes).toBe(70);
    expect(summary.totals.retirementCount).toBe(1);

    const [project] = summary.supplyChain;
    expect(project.retiredTonnes).toBe(30);
    const retirementStage = project.stages.find((stage) => stage.stage === 'retirement');
    expect(retirementStage?.status).toBe('pending');
    expect(retirementStage?.detail).toBe('30 t retired, remainder active');
  });

  it('keeps non-USD spend out of the USD totals and reports it per currency', async () => {
    const usdcLot: SourcePosition = {
      positionId: 'purchase:lot-usdc',
      sourceId: 'buyer-ledger',
      platform: 'unverified',
      assetType: 'credit',
      projectId: 'proj-777',
      projectName: 'Unlisted blue carbon project',
      quantityTonnes: 40,
      status: 'active',
      pricePerTon: 20,
      valueUsd: 800,
      currency: 'USDC',
      recordedAt: '2026-01-15T00:00:00.000Z',
    };

    const summary = await aggregateBuyerAnalytics(
      { buyerId: 'buyer-demo' },
      { sources: [createSource('buyer-ledger', [usdcLot])], now: FROZEN_NOW }
    );

    expect(summary.totals.totalCostUsd).toBe(0);
    expect(summary.totals.costPerTonUsd).toBe(0);
    expect(summary.totals.minCostPerTonUsd).toBe(0);
    expect(summary.totals.maxCostPerTonUsd).toBe(0);
    expect(summary.totals.costByCurrency).toEqual([
      { currency: 'USDC', tonnes: 40, cost: 800, costPerTon: 20 },
    ]);

    const [project] = summary.supplyChain;
    expect(project.costUsd).toBe(0);
    expect(project.costByCurrency).toEqual([
      { currency: 'USDC', tonnes: 40, cost: 800, costPerTon: 20 },
    ]);
  });

  it('prefers co-benefits and project metadata recorded on the position', async () => {
    const ledgerLot: SourcePosition = {
      positionId: 'purchase:lot-meta',
      sourceId: 'buyer-ledger',
      platform: 'plan-vivo',
      assetType: 'credit',
      projectId: 'proj-retired-snapshot',
      projectName: 'Mangrove Restoration - Indonesia',
      quantityTonnes: 60,
      status: 'retired',
      retiredTonnes: 60,
      valueUsd: 60,
      currency: 'USD',
      recordedAt: '2026-01-11T00:00:00.000Z',
      projectType: 'Mangrove Restoration',
      location: 'Indonesia, Coastal Regions',
      coBenefits: ['Coastal Protection', 'Fisheries'],
      retirement: { retirementId: 'ret-2', retiredAt: '2026-02-01T00:00:00.000Z' },
    };

    const summary = await aggregateBuyerAnalytics(
      { buyerId: 'buyer-demo' },
      { sources: [createSource('buyer-ledger', [ledgerLot])], now: FROZEN_NOW }
    );

    // This project id is not in the catalogue, so only position metadata can
    // supply the origination detail.
    expect(summary.coBenefits.map((entry) => entry.name)).toEqual([
      'Coastal Protection',
      'Fisheries',
    ]);
    expect(summary.coBenefits[0]).toMatchObject({ projectCount: 1, tonnes: 60, sharePercentage: 100 });

    const [project] = summary.supplyChain;
    expect(project.projectType).toBe('Mangrove Restoration');
    expect(project.location).toBe('Indonesia, Coastal Regions');
    expect(project.coBenefits).toEqual(['Coastal Protection', 'Fisheries']);

    const origination = project.stages.find((stage) => stage.stage === 'origination');
    expect(origination?.status).toBe('complete');
    expect(origination?.detail).toBe('Mangrove Restoration · Indonesia, Coastal Regions');
  });

  it('aggregates the default sources over real repo data', async () => {
    const summary = await aggregateBuyerAnalytics({
      buyerId: 'buyer-demo',
      account: VALID_ACCOUNT,
    });

    expect(summary.sourceStatuses.map((source) => source.sourceId)).toEqual([
      'stellar-credits',
      'tree-registry',
    ]);
    expect(summary.totals.totalTonnes).toBeGreaterThan(0);
    expect(summary.totals.costPerTonUsd).toBeGreaterThan(0);
    expect(summary.supplyChain.length).toBeGreaterThan(0);
    expect(summary.trends.points.length).toBeGreaterThan(0);
  });
});
