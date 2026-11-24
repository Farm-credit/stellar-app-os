import { beforeEach, describe, expect, it } from 'vitest';
import {
  FinancingError,
  LAND_PREP_PURPOSES,
  MIN_CREDIT_LINE_USD,
  MAX_CREDIT_LINE_USD,
  CREDIT_LINE_INTEREST_PERCENT,
  applyForCreditLine,
  approveCreditLine,
  disburseCreditLine,
  getCreditLine,
  listCreditLines,
  recordCarbonSale,
  rejectCreditLine,
  resetFinancingStore,
} from '@/lib/api/farmer-financing';

const base = {
  farmerId: 'f1',
  projectId: 'proj-001',
  purpose: 'clearing' as const,
  amountUsd: 500,
};

function disbursed() {
  const line = applyForCreditLine(base);
  approveCreditLine(line.id);
  return disburseCreditLine(line.id);
}

describe('farmer financing', () => {
  beforeEach(() => resetFinancingStore());

  // ── constants ────────────────────────────────────────────────────────────

  it('exports the correct module-level constants', () => {
    expect(CREDIT_LINE_INTEREST_PERCENT).toBe(0);
    expect(MIN_CREDIT_LINE_USD).toBe(50);
    expect(MAX_CREDIT_LINE_USD).toBe(5_000);
    expect(LAND_PREP_PURPOSES).toContain('clearing');
    expect(LAND_PREP_PURPOSES).toContain('soil_preparation');
    expect(LAND_PREP_PURPOSES).toContain('seedlings');
    expect(LAND_PREP_PURPOSES).toContain('fencing');
    expect(LAND_PREP_PURPOSES).toContain('irrigation');
    expect(LAND_PREP_PURPOSES).toContain('other');
  });

  // ── applyForCreditLine ───────────────────────────────────────────────────

  it('creates a pending 0% credit line', () => {
    const line = applyForCreditLine(base);
    expect(line.status).toBe('pending');
    expect(line.interestRatePercent).toBe(0);
    expect(line.principalUsd).toBe(500);
    expect(line.outstandingUsd).toBe(500);
    expect(line.repaidUsd).toBe(0);
    expect(line.repayments).toEqual([]);
    expect(line.farmerId).toBe('f1');
    expect(line.projectId).toBe('proj-001');
    expect(line.purpose).toBe('clearing');
    expect(line.id).toMatch(/^credit-/);
    expect(typeof line.createdAt).toBe('string');
    expect(typeof line.updatedAt).toBe('string');
  });

  it('validates that farmerId is required', () => {
    expect(() => applyForCreditLine({ ...base, farmerId: '' })).toThrow(FinancingError);
    expect(() => applyForCreditLine({ ...base, farmerId: '   ' })).toThrow(FinancingError);
  });

  it('validates that projectId is required', () => {
    expect(() => applyForCreditLine({ ...base, projectId: '' })).toThrow(FinancingError);
    expect(() => applyForCreditLine({ ...base, projectId: '   ' })).toThrow(FinancingError);
  });

  it('validates amount boundaries and purpose', () => {
    // below minimum
    expect(() => applyForCreditLine({ ...base, amountUsd: 10 })).toThrow(FinancingError);
    // above maximum
    expect(() => applyForCreditLine({ ...base, amountUsd: 99999 })).toThrow(FinancingError);
    // non-finite
    expect(() => applyForCreditLine({ ...base, amountUsd: NaN })).toThrow(FinancingError);
    // invalid purpose
    expect(() => applyForCreditLine({ ...base, purpose: 'x' as never })).toThrow(FinancingError);
  });

  it('accepts amounts at the exact boundary values', () => {
    const low = applyForCreditLine({ ...base, amountUsd: MIN_CREDIT_LINE_USD });
    expect(low.principalUsd).toBe(MIN_CREDIT_LINE_USD);

    resetFinancingStore();
    const high = applyForCreditLine({ ...base, amountUsd: MAX_CREDIT_LINE_USD });
    expect(high.principalUsd).toBe(MAX_CREDIT_LINE_USD);
  });

  it('allows only one open credit line per farmer', () => {
    applyForCreditLine(base);
    expect(() => applyForCreditLine(base)).toThrow(/open credit line/);
  });

  it('allows a second application once the first is rejected', () => {
    const first = applyForCreditLine(base);
    rejectCreditLine(first.id);
    const second = applyForCreditLine(base);
    expect(second.status).toBe('pending');
  });

  it('allows a second application once the first is fully repaid', () => {
    const line = disbursed();
    recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 500 });
    const second = applyForCreditLine(base);
    expect(second.status).toBe('pending');
  });

  // ── getCreditLine ────────────────────────────────────────────────────────

  it('getCreditLine returns the stored credit line by id', () => {
    const created = applyForCreditLine(base);
    const fetched = getCreditLine(created.id);
    expect(fetched).toBe(created);
  });

  it('getCreditLine throws FinancingError with 404 for unknown id', () => {
    const err = (() => {
      try {
        getCreditLine('nonexistent');
      } catch (e) {
        return e;
      }
    })() as FinancingError;
    expect(err).toBeInstanceOf(FinancingError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
  });

  // ── listCreditLines ──────────────────────────────────────────────────────

  it('listCreditLines returns all lines when no filter given', () => {
    applyForCreditLine(base);
    applyForCreditLine({ ...base, farmerId: 'f2' });
    expect(listCreditLines()).toHaveLength(2);
  });

  it('listCreditLines filters by farmerId', () => {
    applyForCreditLine(base);
    applyForCreditLine({ ...base, farmerId: 'f2' });
    const results = listCreditLines({ farmerId: 'f2' });
    expect(results).toHaveLength(1);
    expect(results[0].farmerId).toBe('f2');
  });

  it('listCreditLines filters by status', () => {
    applyForCreditLine(base);
    applyForCreditLine({ ...base, farmerId: 'f2' });
    const { id } = listCreditLines({ farmerId: 'f2' })[0];
    rejectCreditLine(id);
    expect(listCreditLines({ status: 'pending' })).toHaveLength(1);
    expect(listCreditLines({ status: 'rejected' })).toHaveLength(1);
  });

  it('listCreditLines filters by both farmerId and status', () => {
    applyForCreditLine(base);
    applyForCreditLine({ ...base, farmerId: 'f2' });
    const { id } = listCreditLines({ farmerId: 'f1' })[0];
    rejectCreditLine(id);
    expect(listCreditLines({ farmerId: 'f1', status: 'rejected' })).toHaveLength(1);
    expect(listCreditLines({ farmerId: 'f2', status: 'rejected' })).toHaveLength(0);
  });

  // ── status transitions ───────────────────────────────────────────────────

  it('enforces status transitions: cannot disburse before approval', () => {
    const line = applyForCreditLine(base);
    expect(() => disburseCreditLine(line.id)).toThrow(FinancingError);
  });

  it('enforces status transitions: cannot approve after rejection', () => {
    const line = applyForCreditLine(base);
    rejectCreditLine(line.id);
    expect(() => approveCreditLine(line.id)).toThrow(FinancingError);
  });

  it('full happy-path: pending → approved → disbursed', () => {
    const pending = applyForCreditLine(base);
    expect(pending.status).toBe('pending');

    const approved = approveCreditLine(pending.id);
    expect(approved.status).toBe('approved');

    const disbursedLine = disburseCreditLine(approved.id);
    expect(disbursedLine.status).toBe('disbursed');
  });

  // ── recordCarbonSale ─────────────────────────────────────────────────────

  it('repays from sale proceeds with no interest (partial then over-payment)', () => {
    const line = disbursed();

    const first = recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 200 });
    expect(first.repaymentUsd).toBe(200);
    expect(first.farmerPayoutUsd).toBe(0);
    expect(first.creditLine.outstandingUsd).toBe(300);
    expect(first.creditLine.status).toBe('disbursed');

    const second = recordCarbonSale(line.id, { saleId: 's2', proceedsUsd: 450 });
    expect(second.repaymentUsd).toBe(300);
    expect(second.farmerPayoutUsd).toBe(150);
    expect(second.creditLine.outstandingUsd).toBe(0);
    expect(second.creditLine.status).toBe('repaid');
  });

  it('marks the line as repaid when a single sale covers the full principal', () => {
    const line = disbursed(); // principal = 500
    const result = recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 500 });
    expect(result.repaymentUsd).toBe(500);
    expect(result.farmerPayoutUsd).toBe(0);
    expect(result.creditLine.status).toBe('repaid');
    expect(result.creditLine.repaidUsd).toBe(500);
  });

  it('records each repayment in the repayments array', () => {
    const line = disbursed();
    recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 100 });
    recordCarbonSale(line.id, { saleId: 's2', proceedsUsd: 100 });
    expect(line.repayments).toHaveLength(2);
    expect(line.repayments[0].saleId).toBe('s1');
    expect(line.repayments[1].saleId).toBe('s2');
  });

  it('rejects sales on non-disbursed lines', () => {
    const pending = applyForCreditLine(base);
    expect(() => recordCarbonSale(pending.id, { saleId: 's', proceedsUsd: 1 })).toThrow(
      FinancingError
    );
  });

  it('rejects duplicate saleId on the same credit line', () => {
    const line = disbursed();
    recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 10 });
    expect(() => recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 10 })).toThrow(
      /already applied/
    );
  });

  it('validates saleId and proceedsUsd inputs', () => {
    const line = disbursed();
    expect(() => recordCarbonSale(line.id, { saleId: '', proceedsUsd: 10 })).toThrow(FinancingError);
    expect(() => recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 0 })).toThrow(FinancingError);
    expect(() => recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: -1 })).toThrow(FinancingError);
    expect(() => recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: NaN })).toThrow(FinancingError);
  });

  it('throws FinancingError for unknown credit line id in recordCarbonSale', () => {
    expect(() => recordCarbonSale('bad-id', { saleId: 's1', proceedsUsd: 100 })).toThrow(
      FinancingError
    );
  });
});
