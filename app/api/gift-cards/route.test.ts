import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendGiftCardEmail } = vi.hoisted(() => ({
  sendGiftCardEmail: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/lib/email/sendgrid', () => ({ sendGiftCardEmail }));

import { clearGiftCardStore, GIFT_CARD_REGIONS, GIFT_CARD_SPECIES } from '@/lib/gift-cards/giftCard';
import { GET, POST } from './route';
import { GET as GET_CARD } from './[code]/route';
import { POST as REDEEM_CARD } from './[code]/redeem/route';

let ipCounter = 0;

function jsonPost(url: string, body: unknown, raw = false): NextRequest {
  ipCounter += 1;
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.1.0.${ipCounter}`,
    },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const VALID_PURCHASE = {
  denominationId: 'grove-75',
  purchaserName: 'Alex Rivera',
  purchaserEmail: 'alex@example.com',
  recipientName: 'Amara Okafor',
  recipientEmail: 'amara@example.com',
  personalMessage: 'Happy birthday! Plant something wonderful.',
};

beforeEach(() => {
  clearGiftCardStore();
  sendGiftCardEmail.mockClear();
});

describe('/api/gift-cards', () => {
  it('returns fixed denominations and redemption options on GET', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.denominations.length).toBeGreaterThan(0);
    expect(body.species).toEqual([...GIFT_CARD_SPECIES]);
    expect(body.regions).toEqual([...GIFT_CARD_REGIONS]);
  });

  it('purchases a gift card, emails the recipient with personalised message, and supports lookup + redemption', async () => {
    const purchaseRes = await POST(jsonPost('http://localhost:3000/api/gift-cards', VALID_PURCHASE));
    expect(purchaseRes.status).toBe(201);
    const purchaseBody = await purchaseRes.json();

    expect(purchaseBody.giftCard.code).toMatch(/^TREE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(purchaseBody.giftCard.amountUsd).toBe(75);
    expect(purchaseBody.giftCard.treeCount).toBe(5);
    expect(purchaseBody.redeemUrl).toContain(`/gift-cards/redeem?code=${purchaseBody.giftCard.code}`);
    expect(purchaseBody.emailSent).toBe(true);

    expect(sendGiftCardEmail).toHaveBeenCalledTimes(1);
    const [emailParams] = sendGiftCardEmail.mock.calls[0] as unknown as [
      { to: string; text: string; html: string },
    ];
    expect(emailParams.to).toBe('amara@example.com');
    expect(emailParams.text).toContain(VALID_PURCHASE.personalMessage);
    expect(emailParams.html).toContain(VALID_PURCHASE.personalMessage);

    const code = purchaseBody.giftCard.code as string;

    const lookupRes = await GET_CARD(
      new NextRequest(`http://localhost:3000/api/gift-cards/${code}`),
      { params: Promise.resolve({ code }) }
    );
    expect(lookupRes.status).toBe(200);
    const lookupBody = await lookupRes.json();
    expect(lookupBody.giftCard.status).toBe('active');

    const redeemRes = await REDEEM_CARD(
      jsonPost(`http://localhost:3000/api/gift-cards/${code}/redeem`, {
        redeemedByName: 'Amara Okafor',
        redeemedByEmail: 'amara@example.com',
        species: GIFT_CARD_SPECIES[0],
        region: GIFT_CARD_REGIONS[0],
        treeName: 'Birthday Grove',
      }),
      { params: Promise.resolve({ code }) }
    );
    expect(redeemRes.status).toBe(200);
    const redeemBody = await redeemRes.json();
    expect(redeemBody.giftCard.status).toBe('redeemed');
    expect(redeemBody.assignedTreeIds).toHaveLength(5);

    const duplicateRes = await REDEEM_CARD(
      jsonPost(`http://localhost:3000/api/gift-cards/${code}/redeem`, {
        redeemedByName: 'Amara Okafor',
        redeemedByEmail: 'amara@example.com',
        species: GIFT_CARD_SPECIES[0],
        region: GIFT_CARD_REGIONS[0],
      }),
      { params: Promise.resolve({ code }) }
    );
    expect(duplicateRes.status).toBe(409);
  });

  it('returns 400 on invalid purchase input and 404 on unknown code', async () => {
    const badRes = await POST(
      jsonPost('http://localhost:3000/api/gift-cards', {
        ...VALID_PURCHASE,
        denominationId: 'nope',
      })
    );
    expect(badRes.status).toBe(400);

    const notFoundRes = await GET_CARD(
      new NextRequest('http://localhost:3000/api/gift-cards/TREE-NONE-0000'),
      { params: Promise.resolve({ code: 'TREE-NONE-0000' }) }
    );
    expect(notFoundRes.status).toBe(404);
  });
});
