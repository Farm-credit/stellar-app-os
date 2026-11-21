import { describe, expect, it } from 'vitest';
import {
  createBulkPurchaseAgreement,
  VolumeDiscountError,
} from '@/lib/marketplace/volume-discount';

const agreement = {
  buyerId: 'buyer',
  farmerId: 'farmer',
  basePricePerTon: 10,
  currency: 'USD',
  minimumTons: 100,
  maximumTons: 1000,
  active: true,
  tiers: [{ minTons: 100, maxTons: null, discountRate: 0.1 }],
};

describe('volume tier validation after merge repair', () => {
  it('validates a finite tier without unresolved helper identifiers', () => {
    expect(createBulkPurchaseAgreement(agreement).tiers).toEqual(agreement.tiers);
  });
  it('rejects non-finite discount rates', () => {
    expect(() =>
      createBulkPurchaseAgreement({
        ...agreement,
        tiers: [{ minTons: 100, maxTons: null, discountRate: NaN }],
      })
    ).toThrow(VolumeDiscountError);
  });
});
