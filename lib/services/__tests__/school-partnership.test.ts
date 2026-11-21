import { describe, expect, it } from 'vitest';
import { calculateBatchPrice } from '@/lib/services/school-partnership';
import { SCHOOL_TIER_DISCOUNTS, type SchoolTier } from '@/lib/types/school-partnership';

describe('school partnerships', () => {
  describe('SCHOOL_TIER_DISCOUNTS', () => {
    it('has discounts for all tiers', () => {
      const tiers: SchoolTier[] = ['standard', 'bronze', 'silver', 'gold'];
      for (const tier of tiers) {
        expect(SCHOOL_TIER_DISCOUNTS[tier]).toBeGreaterThanOrEqual(0);
        expect(SCHOOL_TIER_DISCOUNTS[tier]).toBeLessThanOrEqual(50);
      }
    });

    it('standard tier has no discount', () => {
      expect(SCHOOL_TIER_DISCOUNTS.standard).toBe(0);
    });

    it('gold tier has the highest discount', () => {
      expect(SCHOOL_TIER_DISCOUNTS.gold).toBeGreaterThanOrEqual(SCHOOL_TIER_DISCOUNTS.silver);
      expect(SCHOOL_TIER_DISCOUNTS.gold).toBeGreaterThanOrEqual(SCHOOL_TIER_DISCOUNTS.bronze);
    });
  });

  describe('calculateBatchPrice', () => {
    it('calculates correct original price', () => {
      const result = calculateBatchPrice(10, 5, 0);
      expect(result.original).toBe(50);
      expect(result.discounted).toBe(50);
      expect(result.savings).toBe(0);
    });

    it('applies 10% discount correctly', () => {
      const result = calculateBatchPrice(10, 10, 10);
      expect(result.original).toBe(100);
      expect(result.discounted).toBe(90);
      expect(result.savings).toBe(10);
    });

    it('applies 15% gold discount correctly', () => {
      const result = calculateBatchPrice(20, 10, 15);
      expect(result.original).toBe(200);
      expect(result.discounted).toBe(170);
      expect(result.savings).toBe(30);
    });

    it('handles zero trees', () => {
      const result = calculateBatchPrice(10, 0, 10);
      expect(result.original).toBe(0);
      expect(result.discounted).toBe(0);
      expect(result.savings).toBe(0);
    });

    it('handles zero price', () => {
      const result = calculateBatchPrice(0, 10, 10);
      expect(result.original).toBe(0);
      expect(result.discounted).toBe(0);
      expect(result.savings).toBe(0);
    });

    it('handles maximum 50% discount', () => {
      const result = calculateBatchPrice(100, 1, 50);
      expect(result.original).toBe(100);
      expect(result.discounted).toBe(50);
      expect(result.savings).toBe(50);
    });
  });
});
