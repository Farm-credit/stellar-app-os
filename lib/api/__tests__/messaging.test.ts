/**
 * Unit tests for the farmer ↔ buyer direct-messaging service — Issue #1408
 *
 * Covers conversation creation, participant access control, free-text
 * messaging, structured deal negotiation (propose / counter / accept /
 * reject), unread tracking and thread closure.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  MessagingError,
  acceptDeal,
  closeConversation,
  counterDeal,
  createConversation,
  describeDealTerms,
  getConversation,
  getDealState,
  getUnreadCount,
  handleDealAction,
  listConversations,
  listMessages,
  markConversationRead,
  normalizeDealTerms,
  proposeDeal,
  rejectDeal,
  resetMessagingStore,
  sendMessage,
} from '@/lib/api/messaging';
import type { DealTermsInput } from '@/lib/types/messaging';

const FARMER = 'farmer-1';
const BUYER = 'buyer-1';
const OUTSIDER = 'stranger-1';

function terms(overrides: Partial<DealTermsInput> = {}): DealTermsInput {
  return {
    quantityTons: 100,
    pricePerTon: 40,
    deliveryStart: '2026-10-01T00:00:00.000Z',
    deliveryEnd: '2026-10-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return createConversation({
    farmerId: FARMER,
    buyerId: BUYER,
    initiatorId: FARMER,
    ...overrides,
  });
}

beforeEach(() => {
  resetMessagingStore();
});

// ── Conversation creation ─────────────────────────────────────────────────────

describe('createConversation', () => {
  it('creates a thread with the farmer and buyer as participants', () => {
    const conversation = makeConversation();

    expect(conversation.id).toMatch(/^conv-/);
    expect(conversation.subject).toBe('Custom deal negotiation');
    expect(conversation.status).toBe('open');
    expect(conversation.farmerId).toBe(FARMER);
    expect(conversation.buyerId).toBe(BUYER);
    expect(conversation.participants).toEqual([
      { userId: FARMER, role: 'farmer', displayName: FARMER, walletAddress: undefined },
      { userId: BUYER, role: 'buyer', displayName: BUYER, walletAddress: undefined },
    ]);
    expect(conversation.messages).toEqual([]);
    expect(conversation.proposals).toEqual([]);
  });

  it('trims input and defaults display names to the user ids', () => {
    const conversation = makeConversation({
      farmerName: '  Amina  ',
      subject: '  Maize bulk deal  ',
      projectId: '  proj-001  ',
    });

    expect(conversation.subject).toBe('Maize bulk deal');
    expect(conversation.projectId).toBe('proj-001');
    expect(conversation.participants[0].displayName).toBe('Amina');
  });

  it('rejects missing, identical or non-participant users', () => {
    expect(() => makeConversation({ farmerId: '' })).toThrow(/farmerId is required/);
    expect(() => makeConversation({ buyerId: '  ' })).toThrow(/buyerId is required/);
    expect(() => makeConversation({ buyerId: FARMER })).toThrow(/must be different users/);
    expect(() => makeConversation({ initiatorId: OUTSIDER })).toThrow(
      /initiatorId must be the farmer or the buyer/
    );
  });

  it('rejects an over-long subject', () => {
    expect(() => makeConversation({ subject: 'x'.repeat(161) })).toThrow(
      /subject must be 160 characters or fewer/
    );
  });

  it('refuses a second open thread with the same counterpart and listing', () => {
    makeConversation({ projectId: 'proj-001' });
    expect(() => makeConversation({ projectId: 'proj-001' })).toThrow(/already exists/);
    // A different project is a different deal, so it is allowed.
    expect(() => makeConversation({ projectId: 'proj-002' })).not.toThrow();
  });

  it('records an opening message and a structured offer', () => {
    const conversation = makeConversation({
      initialMessage: '  Interested in 100t  ',
      terms: terms({ pricePerTon: 42 }),
    });

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0]).toMatchObject({ kind: 'text', body: 'Interested in 100t' });
    expect(conversation.messages[1]).toMatchObject({ kind: 'offer' });
    expect(conversation.messages[1].terms?.pricePerTon).toBe(42);
    expect(conversation.status).toBe('negotiating');
    expect(conversation.currentTerms?.quantityTons).toBe(100);
  });
});

// ── Term validation ───────────────────────────────────────────────────────────

describe('normalizeDealTerms', () => {
  it('defaults the currency to XLM and upper-cases a supplied one', () => {
    expect(normalizeDealTerms(terms()).currency).toBe('XLM');
    expect(normalizeDealTerms(terms({ currency: 'usd' })).currency).toBe('USD');
  });

  it('rounds quantity to 4 dp and price to 2 dp', () => {
    const normalised = normalizeDealTerms(
      terms({ quantityTons: 100.123456, pricePerTon: 40.987 })
    );
    expect(normalised.quantityTons).toBe(100.1235);
    expect(normalised.pricePerTon).toBe(40.99);
  });

  it('rejects non-positive volume or price', () => {
    expect(() => normalizeDealTerms(terms({ quantityTons: 0 }))).toThrow(
      /quantityTons must be greater than zero/
    );
    expect(() => normalizeDealTerms(terms({ pricePerTon: -1 }))).toThrow(
      /pricePerTon must be greater than zero/
    );
  });

  it('rejects invalid or inverted delivery windows', () => {
    expect(() => normalizeDealTerms(terms({ deliveryStart: 'not-a-date' }))).toThrow(
      /deliveryStart must be a valid ISO-8601 date/
    );
    expect(() =>
      normalizeDealTerms(
        terms({ deliveryStart: '2026-11-01T00:00:00.000Z', deliveryEnd: '2026-10-01T00:00:00.000Z' })
      )
    ).toThrow(/deliveryStart must be on or before deliveryEnd/);
  });

  it('caps the notes length', () => {
    expect(() => normalizeDealTerms(terms({ notes: 'y'.repeat(501) }))).toThrow(
      /notes must be 500 characters or fewer/
    );
  });

  it('describes terms in a single human-readable line', () => {
    expect(describeDealTerms(normalizeDealTerms(terms()))).toBe(
      '100 t @ 40 XLM/t (delivery 2026-10-01T00:00:00.000Z → 2026-10-15T00:00:00.000Z)'
    );
  });
});

// ── Messaging ─────────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('appends a text message and trims the body', () => {
    const conversation = makeConversation();
    const message = sendMessage(conversation.id, {
      senderId: BUYER,
      body: '  Can you deliver in October?  ',
    });

    expect(message.kind).toBe('text');
    expect(message.body).toBe('Can you deliver in October?');
    expect(message.senderRole).toBe('buyer');
    expect(message.readBy).toEqual([BUYER]);
    expect(listMessages(conversation.id)).toHaveLength(1);
  });

  it('rejects empty messages and non-participants', () => {
    const conversation = makeConversation();
    expect(() => sendMessage(conversation.id, { senderId: BUYER, body: '   ' })).toThrow(
      /Message body cannot be empty/
    );
    expect(() => sendMessage(conversation.id, { senderId: OUTSIDER, body: 'hi' })).toThrow(
      /participants/
    );
  });

  it('rejects an over-long body', () => {
    const conversation = makeConversation();
    expect(() =>
      sendMessage(conversation.id, { senderId: BUYER, body: 'x'.repeat(4001) })
    ).toThrow(/4000 characters or fewer/);
  });

  it('records terms attached to a message as a structured offer', () => {
    const conversation = makeConversation();
    const message = sendMessage(conversation.id, {
      senderId: BUYER,
      body: '',
      terms: terms({ pricePerTon: 33 }),
    });

    expect(message.kind).toBe('offer');
    expect(message.body).toBe(describeDealTerms(normalizeDealTerms(terms({ pricePerTon: 33 }))));
    expect(getDealState(conversation.id).pendingProposal?.proposedBy).toBe(BUYER);
  });
});

// ── Deal negotiation ──────────────────────────────────────────────────────────

describe('deal negotiation', () => {
  it('lets the buyer counter the farmer offer, superseding it', () => {
    const conversation = makeConversation({ terms: terms({ pricePerTon: 50 }) });

    const countered = counterDeal(conversation.id, BUYER, terms({ pricePerTon: 45 }), 'Meet in the middle?');

    expect(countered.proposals).toHaveLength(2);
    expect(countered.proposals[0].status).toBe('superseded');
    expect(countered.proposals[1]).toMatchObject({
      status: 'pending',
      proposedBy: BUYER,
    });
    const last = countered.messages[1];
    expect(last.kind).toBe('counter_offer');
    expect(last.body).toBe('Meet in the middle?');
    expect(countered.currentTerms?.pricePerTon).toBe(45);
  });

  it('agrees the deal when the counterparty accepts', () => {
    const conversation = makeConversation({ terms: terms({ pricePerTon: 50 }) });
    counterDeal(conversation.id, BUYER, terms({ pricePerTon: 45 }));

    const agreed = acceptDeal(conversation.id, FARMER);

    expect(agreed.status).toBe('agreed');
    expect(agreed.agreedTerms?.pricePerTon).toBe(45);
    expect(agreed.proposals[1].status).toBe('accepted');
    expect(agreed.proposals[1].respondedBy).toBe(FARMER);
    expect(agreed.messages[agreed.messages.length - 1].kind).toBe('accept');
  });

  it('forbids accepting or rejecting your own offer', () => {
    const conversation = makeConversation({ terms: terms() });
    expect(() => acceptDeal(conversation.id, FARMER)).toThrow(/cannot accept your own offer/);
    expect(() => rejectDeal(conversation.id, FARMER)).toThrow(/cannot reject your own offer/);
    expect(() => counterDeal(conversation.id, FARMER, terms())).toThrow(
      /cannot counter your own offer/
    );
  });

  it('declines a deal and allows a fresh proposal to revive it', () => {
    const conversation = makeConversation({ terms: terms() });

    const declined = rejectDeal(conversation.id, BUYER, undefined);
    expect(declined.status).toBe('declined');
    expect(declined.agreedTerms).toBeNull();
    expect(declined.proposals[0].status).toBe('rejected');
    expect(declined.messages[declined.messages.length - 1].kind).toBe('reject');

    const revived = proposeDeal(conversation.id, FARMER, terms({ pricePerTon: 38 }));
    expect(revived.status).toBe('negotiating');
    expect(getDealState(conversation.id).pendingProposal?.proposedBy).toBe(FARMER);
  });

  it('requires a pending offer before responding', () => {
    const conversation = makeConversation();
    expect(() => acceptDeal(conversation.id, BUYER)).toThrow(/no pending offer/);
    expect(() => counterDeal(conversation.id, BUYER, terms())).toThrow(/no pending offer/);
  });

  it('refuses offers on an agreed deal', () => {
    const conversation = makeConversation({ terms: terms() });
    acceptDeal(conversation.id, BUYER);
    expect(() => proposeDeal(conversation.id, FARMER, terms({ pricePerTon: 30 }))).toThrow(
      /already been agreed/
    );
  });

  it('dispatches actions through handleDealAction', () => {
    const conversation = makeConversation();

    expect(() =>
      handleDealAction(conversation.id, { actorId: FARMER, action: 'propose' })
    ).toThrow(/terms are required/);

    const proposed = handleDealAction(conversation.id, {
      actorId: FARMER,
      action: 'propose',
      terms: terms({ pricePerTon: 41 }),
    });
    expect(proposed.status).toBe('negotiating');

    const accepted = handleDealAction(conversation.id, {
      actorId: BUYER,
      action: 'accept',
    });
    expect(accepted.status).toBe('agreed');
  });

  it('negotiates custom deal volume, delivery timing windows and pricing', () => {
    const conversation = makeConversation();
    const customDeal = handleDealAction(conversation.id, {
      actorId: BUYER,
      action: 'propose',
      terms: {
        quantityTons: 250.5,
        pricePerTon: 32.75,
        currency: 'USDC',
        deliveryStart: '2026-11-01T00:00:00.000Z',
        deliveryEnd: '2026-11-30T00:00:00.000Z',
        notes: 'High-grade agroforestry credits with community co-benefits',
      },
      note: 'Proposing bulk order for Q4 delivery',
    });

    expect(customDeal.currentTerms?.quantityTons).toBe(250.5);
    expect(customDeal.currentTerms?.pricePerTon).toBe(32.75);
    expect(customDeal.currentTerms?.currency).toBe('USDC');
    expect(customDeal.currentTerms?.notes).toContain('High-grade agroforestry');

    // Counter with revised timing and price
    const countered = handleDealAction(conversation.id, {
      actorId: FARMER,
      action: 'counter',
      terms: {
        quantityTons: 250.5,
        pricePerTon: 34.0,
        currency: 'USDC',
        deliveryStart: '2026-11-15T00:00:00.000Z',
        deliveryEnd: '2026-12-15T00:00:00.000Z',
        notes: 'Delivery staged across mid-November to mid-December',
      },
      note: 'Countered price and delivery window',
    });

    expect(countered.currentTerms?.pricePerTon).toBe(34.0);
    expect(countered.currentTerms?.deliveryStart).toBe('2026-11-15T00:00:00.000Z');
  });
});

// ── Access control & read state ───────────────────────────────────────────────

describe('access control', () => {
  it('hides threads and messages from non-participants', () => {
    const conversation = makeConversation({ initialMessage: 'hello' });
    expect(() => getConversation(conversation.id, OUTSIDER)).toThrow(/participants/);
    expect(() => listMessages(conversation.id, { viewerId: OUTSIDER })).toThrow(/participants/);
    expect(() => getUnreadCount(conversation.id, OUTSIDER)).toThrow(/participants/);
    expect(listConversations({ userId: OUTSIDER })).toEqual([]);
  });

  it('throws a MessagingError with a status for the route layer', () => {
    expect(() => getConversation('conv-missing')).toThrow(MessagingError);
    try {
      getConversation('conv-missing');
    } catch (error) {
      expect((error as MessagingError).status).toBe(404);
    }
  });
});

describe('read state', () => {
  it('tracks unread counts per participant', () => {
    const conversation = makeConversation({ initialMessage: 'hello' });
    sendMessage(conversation.id, { senderId: BUYER, body: 'hi back' });

    expect(getUnreadCount(conversation.id, FARMER)).toBe(1);
    expect(getUnreadCount(conversation.id, BUYER)).toBe(1);

    markConversationRead(conversation.id, FARMER);
    expect(getUnreadCount(conversation.id, FARMER)).toBe(0);
    expect(getUnreadCount(conversation.id, BUYER)).toBe(1);
  });

  it('filters the inbox to unread threads and by role', () => {
    const conversation = makeConversation({ initialMessage: 'hello' });
    expect(listConversations({ userId: BUYER, unreadOnly: true })).toHaveLength(1);
    expect(listConversations({ userId: FARMER, unreadOnly: true })).toHaveLength(0);

    markConversationRead(conversation.id, BUYER);
    expect(listConversations({ userId: BUYER, unreadOnly: true })).toHaveLength(0);

    expect(listConversations({ userId: FARMER, role: 'farmer' })).toHaveLength(1);
    expect(listConversations({ userId: FARMER, role: 'buyer' })).toHaveLength(0);
  });

  it('requires a userId for unread-only listings', () => {
    expect(() => listConversations({ unreadOnly: true })).toThrow(/userId is required/);
  });

  it('exposes a summary with the last message and unread count', () => {
    const conversation = makeConversation({ initialMessage: 'hello', subject: 'Maize deal' });
    const [summary] = listConversations({ userId: BUYER });

    expect(summary).toMatchObject({
      id: conversation.id,
      subject: 'Maize deal',
      messageCount: 1,
      unreadCount: 1,
    });
    expect(summary.lastMessage?.body).toBe('hello');
  });

  it('searches subject, participants and message bodies', () => {
    makeConversation({ subject: 'Sorghum bulk', initialMessage: 'we can ship in October' });
    expect(listConversations({ userId: FARMER, search: 'sorghum' })).toHaveLength(1);
    expect(listConversations({ userId: FARMER, search: 'october' })).toHaveLength(1);
    expect(listConversations({ userId: FARMER, search: 'nonexistent' })).toHaveLength(0);
  });
});

// ── Message listing & lifecycle ───────────────────────────────────────────────

describe('listMessages', () => {
  it('returns only the most recent messages when limited', () => {
    const conversation = makeConversation({ initialMessage: 'one' });
    sendMessage(conversation.id, { senderId: BUYER, body: 'two' });
    sendMessage(conversation.id, { senderId: FARMER, body: 'three' });

    expect(listMessages(conversation.id).map((message) => message.body)).toEqual([
      'one',
      'two',
      'three',
    ]);
    expect(listMessages(conversation.id, { limit: 2 }).map((message) => message.body)).toEqual([
      'two',
      'three',
    ]);
    expect(() => listMessages(conversation.id, { limit: 0 })).toThrow(/positive integer/);
  });
});

describe('closeConversation', () => {
  it('closes the thread and makes it read-only', () => {
    const conversation = makeConversation({ initialMessage: 'hello' });

    const closed = closeConversation(conversation.id, FARMER);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();

    expect(() => sendMessage(conversation.id, { senderId: BUYER, body: 'later' })).toThrow(
      /closed/
    );
    expect(() => proposeDeal(conversation.id, BUYER, terms())).toThrow(/closed/);
    expect(() => closeConversation(conversation.id, BUYER)).toThrow(/already closed/);
  });
});
