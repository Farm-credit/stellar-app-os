import { describe, expect, it } from 'vitest';
import {
  buildOwnedCreditsView,
  coBenefitsFor,
  enrichHolding,
  portfolioCoBenefits,
  PROJECT_METADATA,
} from './portfolio';
import type { CreditHolding } from '@/lib/types/credits';

function holding(overrides: Partial<CreditHolding> = {}): CreditHolding {
  return {
    projectId: 'PROJ-004',
    projectName: 'Mangrove Restoration - Indonesia',
    quantity: 10,
    vintage: 2024,
    status: 'active',
    pricePerTon: 42.5,
    totalValue: 425,
    assetCode: 'CARBON-PROJ-004-2024',
    issuer: 'GISSUER',
    ...overrides,
  };
}

describe('enrichHolding', () => {
  it('derives purchase cost from quantity and price', () => {
    const enriched = enrichHolding(holding());
    expect(enriched.purchaseCost).toBe(425);
    expect(enriched.coBenefits).toContain('biodiversity');
    expect(enriched.retirementDate).toBeNull();
  });

  it('prefers values carried on the holding', () => {
    const enriched = enrichHolding(
      holding({
        purchaseCost: 399.99,
        retirementDate: '2026-01-15',
        coBenefits: ['custom benefit'],
      })
    );
    expect(enriched.purchaseCost).toBe(399.99);
    expect(enriched.retirementDate).toBe('2026-01-15');
    expect(enriched.coBenefits).toEqual(['custom benefit']);
  });

  it('rounds derived cost to two decimals', () => {
    const enriched = enrichHolding(holding({ quantity: 3, pricePerTon: 10.333 }));
    expect(enriched.purchaseCost).toBe(31);
  });
});

describe('buildOwnedCreditsView', () => {
  it('totals credits and cost and counts statuses', () => {
    const view = buildOwnedCreditsView([
      holding({ quantity: 10, pricePerTon: 42.5 }),
      holding({ projectId: 'PROJ-002', status: 'retired', quantity: 2.5, pricePerTon: 20, assetCode: 'CARBON-PROJ-002-2024-RET' }),
    ]);

    expect(view.credits).toHaveLength(2);
    expect(view.totalCredits).toBe(12.5);
    expect(view.totalCost).toBe(475);
    expect(view.activeCredits).toBe(1);
    expect(view.retiredCredits).toBe(1);
  });

  it('carries retirement dates through to the view', () => {
    const view = buildOwnedCreditsView([
      holding({ status: 'retired', retirementDate: '2026-02-01' }),
    ]);
    expect(view.credits[0].retirementDate).toBe('2026-02-01');
  });

  it('is empty-safe', () => {
    const view = buildOwnedCreditsView([]);
    expect(view.credits).toEqual([]);
    expect(view.totalCredits).toBe(0);
    expect(view.totalCost).toBe(0);
  });
});

describe('co-benefits helpers', () => {
  it('returns known co-benefits and an empty list for unknown projects', () => {
    expect(coBenefitsFor('PROJ-001')).toEqual(PROJECT_METADATA['PROJ-001'].coBenefits);
    expect(coBenefitsFor('PROJ-999')).toEqual([]);
  });

  it('de-duplicates and sorts portfolio co-benefits', () => {
    const view = buildOwnedCreditsView([
      holding({ projectId: 'PROJ-004' }),
      holding({ projectId: 'PROJ-001', status: 'retired' }),
    ]);
    expect(portfolioCoBenefits(view)).toEqual([
      'biodiversity',
      'coastal protection',
      'community employment',
      'soil health',
    ]);
  });
});
