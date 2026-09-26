import { describe, expect, it } from 'vitest';
import { quoteFuturesOrder, validateFuturesOrder } from './futures';

describe('carbon futures quotes', () => {
  it('locks a transparent forward price for a future delivery year', () => {
    expect(
      quoteFuturesOrder({
        projectId: 'proj-001',
        quantity: 100,
        spotPricePerTon: 45.5,
        deliveryYear: 2028,
        currentYear: 2026,
      })
    ).toMatchObject({
      yearsToDelivery: 2,
      lockedPricePerTon: 50.05,
      notionalValue: 5005,
    });
  });

  it('rejects past delivery and invalid quantities', () => {
    expect(
      validateFuturesOrder({
        projectId: 'proj-001',
        quantity: 0,
        spotPricePerTon: 45,
        deliveryYear: 2025,
        currentYear: 2026,
      })
    ).toBe('Quantity must be greater than zero.');
    expect(
      validateFuturesOrder({
        projectId: 'proj-001',
        quantity: 1,
        spotPricePerTon: 45,
        deliveryYear: 2026,
        currentYear: 2026,
      })
    ).toBe('Delivery must be a future calendar year.');
  });
});
