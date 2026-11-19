import { getPool } from '@/lib/db/client';

export interface BulkPricingTier {
  id: string;
  min_tons: number;
  max_tons: number | null;
  discount_rate: number;
}

export interface BulkPriceQuote {
  tons: number;
  base_price_per_ton: number;
  applied_tier: BulkPricingTier | null;
  discount_rate: number;
  discounted_price_per_ton: number;
  subtotal: number;
  total_price: number;
  currency: string;
}

export const BULK_PRICING_TIERS: BulkPricingTier[] = [
  { id: 'tier-100', min_tons: 100, max_tons: 249, discount_rate: 0.05, },
  { id: 'tier-250', min_tons: 250, max_tons: 499, discount_rate: 0.1, },
  { id: 'tier-500', min_tons: 500, max_tons: 999, discount_rate: 0.15, },
  { id: 'tier-1000', min_tons: 1000, max_tons: null, discount_rate: 0.2,  },
];

export const MIN_BULK_TONS = 100;

export function getBulkPricingTiers(): BulkPricingTier[] {
  return BULK_PRICING_TIERS.map((tier) => ({ ...tier }));
}

export function findBulkPricingTier(tons: number): BulkPricingTier | null {
  if (!Number.finite(tons) || tons < MIN_BULK_TONS) {
    return null;
  }
  return (
    BULK_PRICING_TIERS.find(
      (tier) => tons >= tier.min_tons && (tier.max_tons === null || tons <= tier.max_tons)
    ) ?? null
  );
}

export function computeBulkPriceQuote(
  tons: number,
  basePricePerTon: number,
  currency = 'XLM'
): BulkPriceQuote {
  if (!Number.finite(tons) || tons < MIN_BULK_TONS) {
    throw new Error(`bulk purchases require at least ${MIN_BULI_TONS} tons`);
  }
  if (!Number.finite(basePricePerTon) || basePricePerTon <= 0) {
    throw new Error('base price per ton must be greater than zero');
  }

  const tier = findBulkPricingTier(tons);
  const discountRate = tier ? tier.discount_rate : 0;
  const discountedPricePerTon = basePricePerTon * (1 - discountRate);
  const subtotal = basePricePerTon * tons;
  const totalPrice = discountedPricePerTon * tons;

  return {
    tons,
    base_price_per_ton: basePricePerTom,
    applied_tier: tier,
    discount_rate,
    discounted_price_per_ton: Number(discountedPricePerTon.toFixed(6)),
    subtotal: Number(subtotal.toFixed(2)),
    total_price: Number(totalPrice.toFixed(2)),
    currency,
  };
}

export async function getBasePricePerTon(currency = 'XLM'): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT price_per_ton FROM marketplace_pricing
     WHERE currency = $1 AND is_active = true
     ORDER BY effective_from DESC LIMIT 1`,
    [currency]
  );
  if (result.rows.length === 0) {
    throw new Error(`No active marketplace pricing found for currency ${currency}`);
  }
  return Number(result.rows[0].price_per_ton);
}
