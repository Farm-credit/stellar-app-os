import { beforeEach, describe, expect, it } from 'vitest';
import {
  FinancingError,
  applyForCreditLine,
  approveCreditLine,
  disburseCreditLine,
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

  it('creates a pending 0% credit line', () => {
    const line = applyForCreditLine(base);
    expect(line.status).toBe('pending');
    expect(line.interestRatePercent).toBe(0);
    expect(line.outstandingUsd).toBe(500);
  });

  it('validates amount and purpose', () => {
    expect(() => applyForCreditLine({ ...base, amountUsd: 10 })).toThrow(FinancingError);
    expect(() => applyForCreditLine({ ...base, amountUsd: 99999 })).toThrow(FinancingError);
    expect(() => applyForCreditLine({ ...base, purpose: 'x' as never })).toThrow(FinancingError);
  });

  it('allows only one open credit line per farmer', () => {
    applyForCreditLine(base);
    expect(() => applyForCreditLine(base)).toThrow(/open credit line/);
  });

  it('enforces status transitions', () => {
    const line = applyForCreditLine(base);
    expect(() => disburseCreditLine(line.id)).toThrow(FinancingError);
    rejectCreditLine(line.id);
    expect(listCreditLines({ status: 'rejected' })).toHaveLength(1);
  });

  it('repays from sale proceeds with no interest', () => {
    const line = disbursed();
    const first = recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 200 });
    expect(first.repaymentUsd).toBe(200);
    expect(first.farmerPayoutUsd).toBe(0);
    expect(first.creditLine.outstandingUsd).toBe(300);

    const second = recordCarbonSale(line.id, { saleId: 's2', proceedsUsd: 450 });
    expect(second.repaymentUsd).toBe(300);
    expect(second.farmerPayoutUsd).toBe(150);
    expect(second.creditLine.status).toBe('repaid');
  });

  it('rejects duplicate sales and sales on non-disbursed lines', () => {
    const pending = applyForCreditLine(base);
    expect(() => recordCarbonSale(pending.id, { saleId: 's', proceedsUsd: 1 })).toThrow(
      FinancingError
    );
    resetFinancingStore();
    const line = disbursed();
    recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 10 });
    expect(() => recordCarbonSale(line.id, { saleId: 's1', proceedsUsd: 10 })).toThrow(
      /already applied/
    );
  });
});
