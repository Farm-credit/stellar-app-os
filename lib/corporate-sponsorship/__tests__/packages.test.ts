import { describe, expect, it } from 'vitest';
import {
  BASE_TREE_PRICE_USD,
  BULK_SPONSORSHIP_PACKAGES,
  CO2_KG_PER_TREE_PER_YEAR,
  calculateBulkOrderQuote,
  computeCorporateImpactSummary,
  createCorporateOrder,
} from '../packages';

describe('corporate bulk sponsorship packages', () => {
  it('offers 10, 50, 100, and 500 tree packages with increasing volume discounts', () => {
    expect(BULK_SPONSORSHIP_PACKAGES.map((p) => p.quantity)).toEqual([10, 50, 100, 500]);

    const discounts = BULK_SPONSORSHIP_PACKAGES.map((p) => p.discountPercent);
    expect(discounts).toEqual([5, 10, 15, 25]);
  });

  it('calculates volume discount quotes accurately for each package tier', () => {
    const q10 = calculateBulkOrderQuote(10);
    expect(q10.subtotalUsd).toBe(10 * BASE_TREE_PRICE_USD);
    expect(q10.discountPercent).toBe(5);
    expect(q10.discountAmountUsd).toBe(12.5);
    expect(q10.totalUsd).toBe(237.5);
    expect(q10.estimatedCo2KgPerYear).toBe(10 * CO2_KG_PER_TREE_PER_YEAR);

    const q50 = calculateBulkOrderQuote(50);
    expect(q50.discountPercent).toBe(10);
    expect(q50.totalUsd).toBe(1125);

    const q100 = calculateBulkOrderQuote(100);
    expect(q100.discountPercent).toBe(15);
    expect(q100.totalUsd).toBe(2125);

    const q500 = calculateBulkOrderQuote(500);
    expect(q500.discountPercent).toBe(25);
    expect(q500.totalUsd).toBe(9375);
  });

  it('creates a corporate order with matching sponsored tree records', () => {
    const order = createCorporateOrder({
      quantity: 100,
      orderNumber: 'CORP-2026-9999',
      branding: {
        companyName: 'GreenTech Labs',
        tagline: 'Climate Positive 2026',
        primaryColor: '#14532d',
        secondaryColor: '#0d9488',
        contactEmail: 'impact@greentech.example',
      },
    });

    expect(order.orderNumber).toBe('CORP-2026-9999');
    expect(order.quote.quantity).toBe(100);
    expect(order.quote.discountPercent).toBe(15);
    expect(order.trees).toHaveLength(100);
    expect(order.trees[0].treeCode).toBe('CORP-2026-9999-T0001');
    expect(order.trees[99].treeCode).toBe('CORP-2026-9999-T0100');
  });

  it('computes aggregate corporate impact summary across multiple orders', () => {
    const o1 = createCorporateOrder({
      quantity: 10,
      branding: {
        companyName: 'Alpha Co',
        primaryColor: '#166534',
        secondaryColor: '#0f766e',
        contactEmail: 'a@alpha.example',
      },
    });
    const o2 = createCorporateOrder({
      quantity: 50,
      branding: {
        companyName: 'Alpha Co',
        primaryColor: '#166534',
        secondaryColor: '#0f766e',
        contactEmail: 'a@alpha.example',
      },
    });

    const summary = computeCorporateImpactSummary([o1, o2]);
    expect(summary.totalTrees).toBe(60);
    expect(summary.totalOrders).toBe(2);
    expect(summary.annualCo2OffsetKg).toBe(60 * CO2_KG_PER_TREE_PER_YEAR);
    expect(summary.totalSavingsUsd).toBe(12.5 + 125);
  });

  it('rejects invalid quantities and empty company names', () => {
    expect(() => calculateBulkOrderQuote(0)).toThrow();
    expect(() => calculateBulkOrderQuote(-5)).toThrow();
    expect(() =>
      createCorporateOrder({
        quantity: 10,
        branding: {
          companyName: '   ',
          primaryColor: '#166534',
          secondaryColor: '#0f766e',
          contactEmail: 'a@b.com',
        },
      })
    ).toThrow('Company name is required.');
  });
});
