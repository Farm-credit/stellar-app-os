import { describe, it, expect } from 'vitest';
import {
  BULK_MIN_TONS,
  calculateBulkPricing,
  createBulkPurchaseAgreement,
  getBulkPurchaseAgreementById,
  listBulkPurchaseAgreements,
  negotiateBulkAgreementRate,
  updateBulkAgreementStatus,
} from '../bulkPurchasing';

describe('bulkPurchasing', () => {
  describe('calculateBulkPricing', () => {
    it('returns retail pricing without discount below 100 tons', () => {
      const result = calculateBulkPricing(99, 40);
      expect(result.isBulkEligible).toBe(false);
      expect(result.appliedDiscountPercentage).toBe(0);
      expect(result.effectivePricePerTon).toBe(40);
      expect(result.bulkTotalUsd).toBe(3960);
      expect(result.savingsUsd).toBe(0);
    });

    it('does not apply custom negotiated bulk rate when below minimum 100 tons', () => {
      const result = calculateBulkPricing(50, 40, 30);
      expect(result.isBulkEligible).toBe(false);
      expect(result.isNegotiatedCustomRate).toBe(false);
      expect(result.effectivePricePerTon).toBe(40);
      expect(result.savingsUsd).toBe(0);
    });

    it('applies 10% Commercial Bulk discount for 100-499 tons', () => {
      const result = calculateBulkPricing(100, 40);
      expect(result.isBulkEligible).toBe(true);
      expect(result.appliedDiscountPercentage).toBe(10);
      expect(result.effectivePricePerTon).toBe(36);
      expect(result.bulkTotalUsd).toBe(3600);
      expect(result.savingsUsd).toBe(400);
    });

    it('applies 18% Enterprise Bulk discount for 500-999 tons', () => {
      const result = calculateBulkPricing(500, 50);
      expect(result.isBulkEligible).toBe(true);
      expect(result.appliedDiscountPercentage).toBe(18);
      expect(result.effectivePricePerTon).toBe(41);
      expect(result.bulkTotalUsd).toBe(20500);
      expect(result.savingsUsd).toBe(4500);
    });

    it('applies 25% Institutional Bulk discount for 1000+ tons', () => {
      const result = calculateBulkPricing(1200, 40);
      expect(result.isBulkEligible).toBe(true);
      expect(result.appliedDiscountPercentage).toBe(25);
      expect(result.effectivePricePerTon).toBe(30);
      expect(result.bulkTotalUsd).toBe(36000);
      expect(result.savingsUsd).toBe(12000);
    });

    it('applies custom negotiated bilateral rate for 100+ tons', () => {
      const result = calculateBulkPricing(250, 40, 32);
      expect(result.isBulkEligible).toBe(true);
      expect(result.isNegotiatedCustomRate).toBe(true);
      expect(result.effectivePricePerTon).toBe(32);
      expect(result.appliedDiscountPercentage).toBe(20);
      expect(result.bulkTotalUsd).toBe(8000);
      expect(result.savingsUsd).toBe(2000);
    });

    it('caps negotiated rate at base price so buyer never pays above standard price', () => {
      const result = calculateBulkPricing(200, 40, 55);
      expect(result.effectivePricePerTon).toBe(40);
      expect(result.appliedDiscountPercentage).toBe(0);
      expect(result.savingsUsd).toBe(0);
    });
  });

  describe('bulk purchase agreements lifecycle', () => {
    const baseInput = {
      buyer: {
        walletAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVVO5',
        organizationName: 'Acme Climate Corp',
        contactEmail: 'esg@acme.example',
      },
      farmer: {
        walletAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
        name: 'Amina Okafor',
        farmName: 'Highland Agroforestry Co-op',
        region: 'Nakuru, Kenya',
      },
      projectId: 'proj-bulk-test',
      projectName: 'Highland Agroforestry 2026',
      committedTons: 200,
      standardPricePerTon: 40,
      negotiatedPricePerTon: 34,
      terms: {
        deliverySchedule: 'quarterly' as const,
        settlementMethod: 'escrow_milestone' as const,
        notes: 'Initial 200t negotiated agreement',
      },
    };

    it('rejects agreements below the 100-ton minimum', () => {
      expect(() =>
        createBulkPurchaseAgreement({
          ...baseInput,
          committedTons: BULK_MIN_TONS - 1,
        })
      ).toThrow(/minimum batch of 100/i);
    });

    it('creates, retrieves, and filters bulk purchase agreements', () => {
      const created = createBulkPurchaseAgreement(baseInput);
      expect(created.id).toMatch(/^bpa_/);
      expect(created.status).toBe('proposed');
      expect(created.negotiatedPricePerTon).toBe(34);
      expect(created.discountPercentage).toBe(15);
      expect(created.totalValueUsd).toBe(6800);
      expect(created.contractHash).toHaveLength(64);

      const fetched = getBulkPurchaseAgreementById(created.id);
      expect(fetched?.id).toBe(created.id);

      const filtered = listBulkPurchaseAgreements({ projectId: 'proj-bulk-test' });
      expect(filtered.some((a) => a.id === created.id)).toBe(true);
    });

    it('allows renegotiating rate on proposed agreements and recalculates totals', () => {
      const created = createBulkPurchaseAgreement(baseInput);
      const updated = negotiateBulkAgreementRate(created.id, 30, 'Counter-offer accepted');
      expect(updated.negotiatedPricePerTon).toBe(30);
      expect(updated.discountPercentage).toBe(25);
      expect(updated.totalValueUsd).toBe(6000);
      expect(updated.terms.notes).toBe('Counter-offer accepted');
      expect(updated.contractHash).not.toBe(created.contractHash);
    });

    it('enforces valid status transitions and blocks renegotiation once active', () => {
      const created = createBulkPurchaseAgreement(baseInput);
      const active = updateBulkAgreementStatus(created.id, 'active');
      expect(active.status).toBe('active');

      expect(() => negotiateBulkAgreementRate(created.id, 28)).toThrow(/cannot negotiate rate/i);

      const completed = updateBulkAgreementStatus(created.id, 'completed');
      expect(completed.status).toBe('completed');

      expect(() => updateBulkAgreementStatus(created.id, 'active')).toThrow(
        /invalid status transition/i
      );
    });
  });
});
