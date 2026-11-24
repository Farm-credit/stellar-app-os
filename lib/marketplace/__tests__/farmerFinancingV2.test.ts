import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPAYMENT_SHARE_BPS,
  FinancingError,
  MAX_CREDIT_LINE_USD,
  UNDERWRITING_ADVANCE_RATE,
  applyForLandPrepCredit,
  calculateLandPrepCreditLimit,
  getCreditLine,
  parseLandProfile,
  recordCarbonSaleRepayment,
  type LandProfile,
} from '@/lib/marketplace/farmerFinancing';

const NOW = new Date('2026-09-01T00:00:00Z');

const smallFarm: LandProfile = {
  landSizeHectares: 5,
  region: 'africa',
  practiceType: 'agroforestry',
};

let seq = 0;
function openLine(requestedAmount: number, land?: LandProfile) {
  seq += 1;
  return applyForLandPrepCredit(
    {
      farmerId: `farmer-v2-${seq}`,
      farmerName: 'V2 Farmer',
      projectName: 'Land prep',
      location: 'Tamale, Ghana',
      requestedAmount,
      carbonProjectLinkedId: 'listing-005',
      land,
    },
    new Date(NOW.getTime() + seq)
  );
}

function expectFinancingError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(FinancingError);
    expect((error as FinancingError).status).toBe(status);
    return;
  }
  throw new Error('expected a FinancingError');
}

describe('credit limit underwriting (#1414)', () => {
  it('advances a share of low-scenario first-sales income', () => {
    const quote = calculateLandPrepCreditLimit(smallFarm, NOW);
    expect(quote.projectedFirstSalesIncome).toBeGreaterThan(0);
    expect(quote.creditLimit).toBe(
      Math.floor(quote.projectedFirstSalesIncome * UNDERWRITING_ADVANCE_RATE)
    );
  });

  it('never exceeds the hard cap', () => {
    const quote = calculateLandPrepCreditLimit(
      { landSizeHectares: 50_000, region: 'southeast-asia', practiceType: 'mangrove-restoration' },
      NOW
    );
    expect(quote.creditLimit).toBe(MAX_CREDIT_LINE_USD);
  });

  it('grows with land size', () => {
    const small = calculateLandPrepCreditLimit(smallFarm, NOW);
    const larger = calculateLandPrepCreditLimit({ ...smallFarm, landSizeHectares: 10 }, NOW);
    expect(larger.creditLimit).toBeGreaterThan(small.creditLimit);
  });
});

describe('parseLandProfile', () => {
  it('returns undefined when no land details are supplied', () => {
    expect(parseLandProfile({})).toBeUndefined();
  });

  it('rejects partial land details', () => {
    expectFinancingError(() => parseLandProfile({ landSizeHectares: 4 }), 400);
  });

  it('normalizes complete land details', () => {
    expect(
      parseLandProfile({ landSizeHectares: '4', region: 'Africa', practiceType: 'No Till' })
    ).toEqual({ landSizeHectares: 4, region: 'africa', practiceType: 'no-till' });
  });
});

describe('applyForLandPrepCredit v2', () => {
  it('approves up to the underwritten limit at 0% interest', () => {
    const { creditLimit } = calculateLandPrepCreditLimit(smallFarm, NOW);
    const line = openLine(creditLimit + 10_000, smallFarm);

    expect(line.creditLimit).toBe(creditLimit);
    expect(line.approvedAmount).toBe(creditLimit);
    expect(line.outstandingAmount).toBe(creditLimit);
    expect(line.interestRate).toBe(0);
    expect(line.repaymentShareBps).toBe(DEFAULT_REPAYMENT_SHARE_BPS);
    expect(line.practiceType).toBe('agroforestry');
  });

  it('rejects non-positive amounts', () => {
    expectFinancingError(() => openLine(0), 400);
    expectFinancingError(() => openLine(Number.NaN), 400);
  });
});

describe('recordCarbonSaleRepayment (#1414)', () => {
  it('sweeps half of each sale until the line is repaid', () => {
    const line = openLine(1_000);

    const first = recordCarbonSaleRepayment(
      line.id,
      { saleReference: 's-1', saleProceeds: 1_200 },
      NOW
    );
    expect(first.repaymentApplied).toBe(600);
    expect(first.farmerPayout).toBe(600);
    expect(first.creditLine.outstandingAmount).toBe(400);
    expect(first.creditLine.status).toBe('Active');

    // Only the outstanding 400 is taken; the farmer keeps the rest.
    const second = recordCarbonSaleRepayment(
      line.id,
      { saleReference: 's-2', saleProceeds: 2_000 },
      NOW
    );
    expect(second.repaymentApplied).toBe(400);
    expect(second.farmerPayout).toBe(1_600);
    expect(second.creditLine.outstandingAmount).toBe(0);
    expect(second.creditLine.repaidAmount).toBe(1_000);
    expect(second.creditLine.status).toBe('Repaid');
    expect(getCreditLine(line.id).repayments.map((r) => r.saleReference)).toEqual(['s-1', 's-2']);
  });

  it('never charges interest: total repaid equals the amount disbursed', () => {
    const line = openLine(750);
    let reference = 0;
    while (getCreditLine(line.id).status === 'Active') {
      reference += 1;
      recordCarbonSaleRepayment(
        line.id,
        { saleReference: `r-${reference}`, saleProceeds: 333 },
        NOW
      );
    }
    expect(getCreditLine(line.id).repaidAmount).toBe(750);
  });

  it('refuses to apply the same sale twice', () => {
    const line = openLine(1_000);
    recordCarbonSaleRepayment(line.id, { saleReference: 'dup', saleProceeds: 100 }, NOW);
    expectFinancingError(
      () => recordCarbonSaleRepayment(line.id, { saleReference: 'dup', saleProceeds: 100 }, NOW),
      409
    );
  });

  it('refuses repayments on a repaid line', () => {
    expectFinancingError(
      () =>
        recordCarbonSaleRepayment('cc-line-002', { saleReference: 'late', saleProceeds: 100 }, NOW),
      409
    );
  });

  it('rejects unknown lines and invalid sales', () => {
    expectFinancingError(
      () => recordCarbonSaleRepayment('missing', { saleReference: 'x', saleProceeds: 10 }, NOW),
      404
    );
    const line = openLine(500);
    expectFinancingError(
      () => recordCarbonSaleRepayment(line.id, { saleReference: '', saleProceeds: 10 }, NOW),
      400
    );
    expectFinancingError(
      () => recordCarbonSaleRepayment(line.id, { saleReference: 'neg', saleProceeds: -5 }, NOW),
      400
    );
  });
});
