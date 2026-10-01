/**
 * Unit tests for the buyer offset ledger source — Issue #1289
 *
 * Everything here is a pure function: purchase rows, retirement receipts, and
 * the FIFO allocation between them. No database is required, which is the point
 * — the allocation is the only place tonnes could be double counted, so it is
 * tested directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query }),
}));

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  allocateRetirements,
  buildProjectMetadata,
  loadBuyerLedger,
  mapPurchaseRow,
  mapPurchaseToPosition,
  mapRetirementRow,
  parseCoBenefits,
  resolveBuyerWallet,
  type LedgerPurchase,
  type LedgerPurchaseRow,
  type LedgerRetirement,
  type LedgerRetirementRow,
} from '@/lib/api/buyer-offset-ledger';

const WALLET = 'GYNCXMBWLAVK7UJ6TI5SH4RG3QF2PEZODYNCXMBWLAVK7UJ6TI5SH4RG';
const PROGRAM_ID = '3f1b1c7e-9a24-4c1e-8f4a-6b2d5e7c9a10';

beforeEach(() => {
  query.mockReset();
});

afterEach(() => {
  query.mockReset();
});

function purchaseRow(overrides: Partial<LedgerPurchaseRow> = {}): LedgerPurchaseRow {
  return {
    id: 'lot-1',
    project_id: 'proj-001',
    quantity_tco2e: '100.0000',
    unit_price: '45.500000',
    total_price: '4550.00',
    currency: 'USDC',
    purchase_date: '2026-01-10T00:00:00.000Z',
    tx_hash: 'tx-buy-1',
    ...overrides,
  };
}

function retirementRow(overrides: Partial<LedgerRetirementRow> = {}): LedgerRetirementRow {
  return {
    retirement_key: 'ret-1',
    project_id: 'proj-001',
    project_name: 'Amazon Rainforest Reforestation',
    project_location: 'Brazil, Amazon Basin',
    project_type: 'Reforestation',
    vintage_year: 2023,
    co_benefits: ['Biodiversity'],
    credit_amount: '40.0000',
    tx_hash: 'tx-ret-1',
    created_at: '2026-01-20T00:00:00.000Z',
    buyer_email: 'buyer@example.com',
    ...overrides,
  };
}

function purchase(overrides: Partial<LedgerPurchase> = {}): LedgerPurchase {
  return {
    positionId: 'purchase:lot-1',
    projectId: 'proj-001',
    quantityTonnes: 100,
    unitPrice: 45.5,
    totalPrice: 4550,
    currency: 'USDC',
    purchasedAt: '2026-01-10T00:00:00.000Z',
    transactionHash: 'tx-buy-1',
    ...overrides,
  };
}

function retirement(overrides: Partial<LedgerRetirement> = {}): LedgerRetirement {
  return {
    retirementId: 'ret-1',
    projectId: 'proj-001',
    projectName: 'Amazon Rainforest Reforestation',
    projectLocation: 'Brazil, Amazon Basin',
    projectType: 'Reforestation',
    vintageYear: 2023,
    coBenefits: ['Biodiversity'],
    tonnes: 40,
    retiredAt: '2026-01-20T00:00:00.000Z',
    transactionHash: 'tx-ret-1',
    beneficiary: 'buyer@example.com',
    ...overrides,
  };
}

// ── Row mapping ───────────────────────────────────────────────────────────────

describe('mapPurchaseRow', () => {
  it('maps a purchase row and preserves its real currency', () => {
    const mapped = mapPurchaseRow(purchaseRow());

    expect(mapped).toEqual({
      positionId: 'purchase:lot-1',
      projectId: 'proj-001',
      quantityTonnes: 100,
      unitPrice: 45.5,
      totalPrice: 4550,
      currency: 'USDC',
      purchasedAt: '2026-01-10T00:00:00.000Z',
      transactionHash: 'tx-buy-1',
    });
  });

  it('normalizes the currency and accepts a Date purchase_date', () => {
    const mapped = mapPurchaseRow(
      purchaseRow({ currency: 'usd', purchase_date: new Date('2026-01-10T00:00:00.000Z') })
    );

    expect(mapped.currency).toBe('USD');
    expect(mapped.purchasedAt).toBe('2026-01-10T00:00:00.000Z');
  });

  it('defaults a missing currency to the schema default of USDC', () => {
    // The column is NOT NULL with a USDC default, but a null must never be
    // silently relabelled as USD.
    expect(mapPurchaseRow(purchaseRow({ currency: null })).currency).toBe('USDC');
  });
});

describe('parseCoBenefits', () => {
  it('keeps string arrays and drops anything else', () => {
    expect(parseCoBenefits(['Biodiversity', 'Jobs'])).toEqual(['Biodiversity', 'Jobs']);
    expect(parseCoBenefits([])).toEqual([]);
    expect(parseCoBenefits(null)).toEqual([]);
    expect(parseCoBenefits('Biodiversity')).toEqual([]);
    expect(parseCoBenefits([1, null, 'Jobs'])).toEqual(['Jobs']);
  });
});

describe('mapRetirementRow', () => {
  it('maps a receipt including its immutable project snapshot', () => {
    const mapped = mapRetirementRow(retirementRow());

    expect(mapped).toMatchObject({
      retirementId: 'ret-1',
      projectId: 'proj-001',
      projectName: 'Amazon Rainforest Reforestation',
      projectLocation: 'Brazil, Amazon Basin',
      projectType: 'Reforestation',
      vintageYear: 2023,
      coBenefits: ['Biodiversity'],
      tonnes: 40,
      retiredAt: '2026-01-20T00:00:00.000Z',
      transactionHash: 'tx-ret-1',
      beneficiary: 'buyer@example.com',
    });
  });

  it('tolerates missing optional snapshot fields', () => {
    const mapped = mapRetirementRow(
      retirementRow({ project_location: null, project_type: null, vintage_year: null })
    );

    expect(mapped.projectLocation).toBeNull();
    expect(mapped.projectType).toBeNull();
    expect(mapped.vintageYear).toBeNull();
  });
});

// ── Project metadata ──────────────────────────────────────────────────────────

describe('buildProjectMetadata', () => {
  it('prefers the retirement receipt snapshot over the catalogue', () => {
    const metadata = buildProjectMetadata([
      retirement({
        projectName: 'Renamed after purchase',
        projectType: 'Reforestation',
        projectLocation: 'Brazil, Amazon Basin',
        coBenefits: ['Biodiversity'],
      }),
    ]);

    expect(metadata.get('proj-001')).toEqual({
      name: 'Renamed after purchase',
      type: 'Reforestation',
      location: 'Brazil, Amazon Basin',
      vintageYear: 2023,
      coBenefits: ['Biodiversity'],
      platform: 'gold-standard',
    });
  });

  it('prefers the most recent receipt snapshot over earlier ones', () => {
    const metadata = buildProjectMetadata([
      retirement({ retirementId: 'ret-1', projectName: 'Original name', projectType: 'Reforestation' }),
      retirement({
        retirementId: 'ret-2',
        retiredAt: '2026-03-01T00:00:00.000Z',
        projectName: 'Renamed later',
        projectType: 'REDD+',
      }),
    ]);

    expect(metadata.get('proj-001')).toMatchObject({
      name: 'Renamed later',
      type: 'REDD+',
      // A field the latest receipt omits still comes from an earlier one.
      location: 'Brazil, Amazon Basin',
    });
  });

  it('falls back to the catalogue for fields the receipt omits', () => {
    const metadata = buildProjectMetadata([
      retirement({ projectType: null, projectLocation: null, vintageYear: null, coBenefits: [] }),
    ]);

    // proj-001 is a Gold Standard reforestation project in the catalogue.
    expect(metadata.get('proj-001')).toMatchObject({
      type: 'Reforestation',
      location: 'Brazil, Amazon Basin',
      vintageYear: 2023,
      coBenefits: ['Biodiversity', 'Water Conservation', 'Indigenous Communities'],
    });
  });

  it('resolves catalogue metadata for a purchased project that was never retired', () => {
    const metadata = buildProjectMetadata([], ['proj-002']);

    expect(metadata.get('proj-002')).toEqual({
      name: 'Wind Energy Farm - Texas',
      type: 'Renewable Energy',
      location: 'Texas, USA',
      vintageYear: 2024,
      coBenefits: ['Clean Energy', 'Job Creation'],
      platform: 'verra',
    });
  });

  it('reports an unknown project as unverified with the project id as its name', () => {
    const metadata = buildProjectMetadata([
      retirement({ projectId: 'proj-unknown', projectName: 'Unknown Project' }),
    ]);

    expect(metadata.get('proj-unknown')).toMatchObject({
      name: 'Unknown Project',
      platform: 'unverified',
    });
  });

  it('falls back to the project id for an unknown, never-retired project', () => {
    const metadata = buildProjectMetadata([], ['proj-unknown']);
    expect(metadata.get('proj-unknown')).toEqual({
      name: 'proj-unknown',
      type: null,
      location: null,
      vintageYear: null,
      coBenefits: [],
      platform: 'unverified',
    });
  });
});

// ── FIFO allocation ───────────────────────────────────────────────────────────

describe('allocateRetirements', () => {
  it('reports nothing retired when there are no receipts', () => {
    const result = allocateRetirements([purchase()], []);

    expect(result.byPositionId.size).toBe(0);
    expect(result.unallocatedTonnes).toBe(0);
  });

  it('marks a fully retired lot', () => {
    const { byPositionId, unallocatedTonnes } = allocateRetirements(
      [purchase()],
      [retirement({ tonnes: 100 })]
    );

    expect(byPositionId.get('purchase:lot-1')?.retiredTonnes).toBe(100);
    expect(byPositionId.get('purchase:lot-1')?.retirement).toEqual({
      retirementId: 'ret-1',
      retiredAt: '2026-01-20T00:00:00.000Z',
      transactionHash: 'tx-ret-1',
      beneficiary: 'buyer@example.com',
    });
    expect(unallocatedTonnes).toBe(0);
  });

  it('reports a partial retirement without retiring the whole lot', () => {
    const { byPositionId, unallocatedTonnes } = allocateRetirements(
      [purchase()],
      [retirement({ tonnes: 30 })]
    );

    expect(byPositionId.get('purchase:lot-1')?.retiredTonnes).toBe(30);
    expect(unallocatedTonnes).toBe(0);
  });

  it('retires the oldest lot first and spills onto the next lot', () => {
    const older = purchase({
      positionId: 'purchase:old',
      purchasedAt: '2026-01-01T00:00:00.000Z',
      quantityTonnes: 50,
    });
    const newer = purchase({ positionId: 'purchase:new', quantityTonnes: 80 });

    const { byPositionId, unallocatedTonnes } = allocateRetirements(
      [newer, older],
      [retirement({ tonnes: 70 })]
    );

    // Order-independent input, but FIFO output: the January lot absorbs 50 t
    // and the surplus 20 t lands on the February lot.
    expect(byPositionId.get('purchase:old')?.retiredTonnes).toBe(50);
    expect(byPositionId.get('purchase:new')?.retiredTonnes).toBe(20);
    expect(unallocatedTonnes).toBe(0);
  });

  it('never allocates a lot more tonnes than it holds', () => {
    const { byPositionId } = allocateRetirements(
      [purchase({ quantityTonnes: 25 })],
      [retirement({ tonnes: 100 })]
    );

    expect(byPositionId.get('purchase:lot-1')?.retiredTonnes).toBe(25);
  });

  it('does not match a retirement against a lot of a different project', () => {
    const { byPositionId, unallocatedTonnes } = allocateRetirements(
      [purchase({ projectId: 'proj-002' })],
      [retirement({ projectId: 'proj-001', tonnes: 100 })]
    );

    expect(byPositionId.size).toBe(0);
    expect(unallocatedTonnes).toBe(100);
  });

  it('surfaces retirements beyond the recorded purchases instead of inventing them', () => {
    const { byPositionId, unallocatedTonnes } = allocateRetirements(
      [purchase({ quantityTonnes: 100 })],
      [retirement({ tonnes: 150 })]
    );

    expect(byPositionId.get('purchase:lot-1')?.retiredTonnes).toBe(100);
    expect(unallocatedTonnes).toBe(50);
  });

  it('ignores zero and negative receipt quantities', () => {
    const { unallocatedTonnes } = allocateRetirements(
      [purchase()],
      [retirement({ retirementId: 'ret-0', tonnes: 0 }), retirement({ retirementId: 'ret-neg', tonnes: -5 })]
    );

    expect(unallocatedTonnes).toBe(0);
  });

  it('keeps the most recent contributing receipt as the retirement proof', () => {
    const { byPositionId } = allocateRetirements(
      [purchase({ quantityTonnes: 100 })],
      [
        retirement({ retirementId: 'ret-1', tonnes: 30, retiredAt: '2026-01-20T00:00:00.000Z' }),
        retirement({ retirementId: 'ret-2', tonnes: 30, retiredAt: '2026-02-20T00:00:00.000Z' }),
      ]
    );

    expect(byPositionId.get('purchase:lot-1')?.retirement).toMatchObject({
      retirementId: 'ret-2',
      retiredAt: '2026-02-20T00:00:00.000Z',
    });
  });
});

// ── Position mapping ──────────────────────────────────────────────────────────

describe('mapPurchaseToPosition', () => {
  const metadata = buildProjectMetadata([retirement()]);

  it('emits an active position for a lot with no retirement', () => {
    const position = mapPurchaseToPosition(purchase(), undefined, metadata);

    expect(position).toMatchObject({
      positionId: 'purchase:lot-1',
      sourceId: 'buyer-ledger',
      platform: 'gold-standard',
      assetType: 'credit',
      projectId: 'proj-001',
      projectName: 'Amazon Rainforest Reforestation',
      quantityTonnes: 100,
      status: 'active',
      pricePerTon: 45.5,
      valueUsd: 4550,
      currency: 'USDC',
      retiredTonnes: 0,
      recordedAt: '2026-01-10T00:00:00.000Z',
      vintage: 2023,
      projectType: 'Reforestation',
      location: 'Brazil, Amazon Basin',
      coBenefits: ['Biodiversity'],
    });
    expect(position.retirement).toBeUndefined();
  });

  it('keeps a partly retired lot active and reports the real retired tonnage', () => {
    const position = mapPurchaseToPosition(
      purchase(),
      { retiredTonnes: 30, retirement: { retirementId: 'ret-1', retiredAt: '2026-01-20T00:00:00.000Z' } },
      metadata
    );

    expect(position.status).toBe('active');
    expect(position.retiredTonnes).toBe(30);
    expect(position.retirement?.retirementId).toBe('ret-1');
  });

  it('marks a fully retired lot retired', () => {
    const position = mapPurchaseToPosition(
      purchase(),
      { retiredTonnes: 100, retirement: { retirementId: 'ret-1', retiredAt: '2026-01-20T00:00:00.000Z' } },
      metadata
    );

    expect(position.status).toBe('retired');
    expect(position.retiredTonnes).toBe(100);
  });

  it('clamps an over-allocation to the lot size', () => {
    const position = mapPurchaseToPosition(purchase(), { retiredTonnes: 500 }, metadata);

    expect(position.retiredTonnes).toBe(100);
    expect(position.status).toBe('retired');
  });

  it('falls back to the project id when there is no metadata at all', () => {
    const position = mapPurchaseToPosition(
      purchase({ projectId: 'proj-unknown' }),
      undefined,
      new Map()
    );

    expect(position.platform).toBe('unverified');
    expect(position.projectName).toBe('proj-unknown');
    expect(position.coBenefits).toBeUndefined();
  });

  it('resolves catalogue metadata for a never-retired lot', () => {
    const metadata = buildProjectMetadata([], ['proj-002']);
    const position = mapPurchaseToPosition(purchase({ projectId: 'proj-002' }), undefined, metadata);

    expect(position).toMatchObject({
      platform: 'verra',
      projectName: 'Wind Energy Farm - Texas',
      projectType: 'Renewable Energy',
      location: 'Texas, USA',
      coBenefits: ['Clean Energy', 'Job Creation'],
      vintage: 2024,
      status: 'active',
      retiredTonnes: 0,
    });
  });
});

describe('ledger source id', () => {
  it('tags positions so they can be attributed back to the ledger', () => {
    const position = mapPurchaseToPosition(purchase(), undefined, buildProjectMetadata([retirement()]));
    expect(position.sourceId).toBe('buyer-ledger');
  });
});

// ── Wallet resolution ─────────────────────────────────────────────────────────

describe('resolveBuyerWallet', () => {
  it('prefers an explicit account without touching the database', async () => {
    await expect(resolveBuyerWallet('buyer-demo', WALLET)).resolves.toBe(WALLET);
    expect(query).not.toHaveBeenCalled();
  });

  it('treats a Stellar-format buyer id as the wallet', async () => {
    await expect(resolveBuyerWallet(WALLET)).resolves.toBe(WALLET);
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves a corporate program id through the database', async () => {
    query.mockResolvedValueOnce({ rows: [{ wallet_address: WALLET }] });

    await expect(resolveBuyerWallet(PROGRAM_ID)).resolves.toBe(WALLET);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('corporate_offset_programs'),
      [PROGRAM_ID]
    );
  });

  it('returns null when the program has no enrolled wallet', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(resolveBuyerWallet(PROGRAM_ID)).resolves.toBeNull();
  });

  it('returns null for an opaque buyer id without hitting the database', async () => {
    await expect(resolveBuyerWallet('buyer-demo')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

// ── loadBuyerLedger ───────────────────────────────────────────────────────────

describe('loadBuyerLedger', () => {
  it('builds positions and allocates retirements onto them', async () => {
    query
      .mockResolvedValueOnce({ rows: [purchaseRow()] })
      .mockResolvedValueOnce({ rows: [retirementRow()] });

    const ledger = await loadBuyerLedger({ portfolioId: WALLET });

    expect(ledger.wallet).toBe(WALLET);
    expect(ledger.unallocatedRetiredTonnes).toBe(0);
    expect(ledger.positions).toHaveLength(1);
    expect(ledger.positions[0]).toMatchObject({
      positionId: 'purchase:lot-1',
      sourceId: 'buyer-ledger',
      projectId: 'proj-001',
      quantityTonnes: 100,
      retiredTonnes: 40,
      status: 'active',
      currency: 'USDC',
    });
  });

  it('reports retirements with no matching purchase as unallocated', async () => {
    query
      .mockResolvedValueOnce({ rows: [purchaseRow({ quantity_tco2e: '10.0000' })] })
      .mockResolvedValueOnce({ rows: [retirementRow({ credit_amount: '60.0000' })] });

    const ledger = await loadBuyerLedger({ portfolioId: WALLET });

    expect(ledger.unallocatedRetiredTonnes).toBe(50);
    expect(ledger.positions[0]?.retiredTonnes).toBe(10);
  });

  it('skips the database entirely for an unresolvable buyer id', async () => {
    const ledger = await loadBuyerLedger({ portfolioId: 'buyer-demo' });

    expect(ledger).toEqual({ wallet: '', positions: [], unallocatedRetiredTonnes: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it('reads full purchase history and applies the window after allocation', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          purchaseRow({ id: 'lot-old', purchase_date: '2025-12-01T00:00:00.000Z', quantity_tco2e: '60.0000' }),
          purchaseRow({ id: 'lot-new', purchase_date: '2026-01-20T00:00:00.000Z', quantity_tco2e: '40.0000' }),
        ],
      })
      .mockResolvedValueOnce({ rows: [retirementRow({ credit_amount: '80.0000' })] });

    const ledger = await loadBuyerLedger({
      portfolioId: WALLET,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      asOf: new Date('2026-02-02T00:00:00.000Z'),
    });

    // The window is a reporting filter, not an allocation input: the December
    // lot is loaded so the 80 t receipt is matched against it.
    const [purchaseSql, purchaseParams] = query.mock.calls[0];
    expect(purchaseSql).toContain('purchase_date <= $2');
    expect(purchaseSql).not.toContain('purchase_date >=');
    expect(purchaseParams).toEqual([WALLET, '2026-02-01T00:00:00.000Z']);

    // Only the in-window lot is reported, still carrying its 20 t of the
    // retirement that also consumed the out-of-window lot.
    expect(ledger.positions.map((position) => position.positionId)).toEqual(['purchase:lot-new']);
    expect(ledger.positions[0]?.retiredTonnes).toBe(20);
    expect(ledger.unallocatedRetiredTonnes).toBe(0);
  });

  it('bounds retirements by asOf without a lower bound', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await loadBuyerLedger({
      portfolioId: WALLET,
      from: '2026-01-01T00:00:00.000Z',
      asOf: new Date('2026-02-02T00:00:00.000Z'),
    });

    const [retirementSql, retirementParams] = query.mock.calls[1];
    expect(retirementSql).toContain('created_at <= $2');
    expect(retirementSql).not.toContain('created_at >=');
    expect(retirementParams).toEqual([WALLET, '2026-02-02T00:00:00.000Z']);
  });
});
