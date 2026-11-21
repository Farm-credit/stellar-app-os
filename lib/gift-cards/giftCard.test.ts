import { beforeEach, describe, expect, it } from 'vitest';
import {
  GIFT_CARD_DENOMINATIONS,
  GIFT_CARD_REGIONS,
  GIFT_CARD_SPECIES,
  buildGiftCardRedeemUrl,
  clearGiftCardStore,
  createGiftCard,
  getGiftCardByCode,
  redeemGiftCard,
  renderGiftCardEmail,
  validateGiftCardPurchaseInput,
  validateGiftCardRedemptionInput,
} from './giftCard';

beforeEach(() => {
  clearGiftCardStore();
});

describe('lib/gift-cards/giftCard', () => {
  it('exposes fixed denominations with positive USD amounts and tree counts', () => {
    expect(GIFT_CARD_DENOMINATIONS.length).toBeGreaterThanOrEqual(3);
    for (const denom of GIFT_CARD_DENOMINATIONS) {
      expect(denom.amountUsd).toBeGreaterThan(0);
      expect(denom.treeCount).toBeGreaterThan(0);
    }
  });

  it('validates purchase input and rejects invalid denominations or emails', () => {
    const invalid = validateGiftCardPurchaseInput({
      denominationId: 'invalid-denom',
      purchaserName: '',
      purchaserEmail: 'not-an-email',
      recipientName: '',
      recipientEmail: 'bad',
      personalMessage: 'a'.repeat(401),
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors).toHaveProperty('denominationId');
      expect(invalid.errors).toHaveProperty('purchaserName');
      expect(invalid.errors).toHaveProperty('purchaserEmail');
      expect(invalid.errors).toHaveProperty('recipientName');
      expect(invalid.errors).toHaveProperty('recipientEmail');
      expect(invalid.errors).toHaveProperty('personalMessage');
    }
  });

  it('creates a gift card and renders an email with personalised message and redeem link', () => {
    const card = createGiftCard(
      {
        denominationId: 'grove-75',
        purchaserName: 'Alex Rivera',
        purchaserEmail: 'alex@example.com',
        recipientName: 'Amara Okafor',
        recipientEmail: 'amara@example.com',
        personalMessage: 'Happy Birthday <Amara> & enjoy your trees!',
      },
      { code: 'TREE-ABCD-1234' }
    );

    expect(card.amountUsd).toBe(75);
    expect(card.treeCount).toBe(5);
    expect(card.status).toBe('active');
    expect(getGiftCardByCode('tree-abcd-1234')?.id).toBe(card.id);

    const redeemUrl = buildGiftCardRedeemUrl(card.code, 'https://harvesta.app/');
    expect(redeemUrl).toBe('https://harvesta.app/gift-cards/redeem?code=TREE-ABCD-1234');

    const email = renderGiftCardEmail(card, redeemUrl);
    expect(email.subject).toContain('$75');
    expect(email.text).toContain('Happy Birthday <Amara> & enjoy your trees!');
    expect(email.text).toContain('TREE-ABCD-1234');
    expect(email.html).toContain('Happy Birthday &lt;Amara&gt; &amp; enjoy your trees!');
    expect(email.html).toContain(redeemUrl);
  });

  it('redeems an active gift card once and rejects duplicate redemptions', () => {
    const card = createGiftCard({
      denominationId: 'duo-30',
      purchaserName: 'Alex',
      purchaserEmail: 'alex@example.com',
      recipientName: 'Amara',
      recipientEmail: 'amara@example.com',
      personalMessage: 'For you',
    });

    const validation = validateGiftCardRedemptionInput({
      redeemedByName: 'Amara',
      redeemedByEmail: 'amara@example.com',
      species: GIFT_CARD_SPECIES[1],
      region: GIFT_CARD_REGIONS[0],
      treeName: 'Amara Grove',
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const first = redeemGiftCard(card.code, validation.value);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.giftCard.status).toBe('redeemed');
      expect(first.giftCard.redemption?.assignedTreeIds).toHaveLength(2);
      expect(first.giftCard.redemption?.treeName).toBe('Amara Grove');
    }

    const second = redeemGiftCard(card.code, validation.value);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('already_redeemed');
    }
  });
});
