import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FieldMessagingError,
  getSponsorThread,
  resetFieldMessagingForTest,
  sendFieldTeamReply,
  sendSponsorMessage,
} from '../field-messaging';
import { setTranslationProviderForTest } from '@/lib/messaging/translation';
import type { Tree } from '@/lib/types/tree';

const trees: Record<string, Tree> = {
  'tree-001': {
    id: 'tree-001',
    treeId: 'HRV-2024-0001',
    species: 'Teak',
    region: 'Kano, Nigeria',
    status: 'verified',
    lat: 12.04,
    lng: 8.48,
    co2OffsetKgPerYear: 22,
    projectName: 'Northern Savanna Reforestation',
  },
  'tree-007': {
    id: 'tree-007',
    treeId: 'HRV-2024-0007',
    species: 'Eucalyptus',
    region: 'Nairobi, Kenya',
    status: 'verified',
    lat: -1.27,
    lng: 36.78,
    co2OffsetKgPerYear: 31,
    projectName: 'East Africa Urban Greening',
  },
};

vi.mock('@/lib/api/tree-registry', () => ({
  getTreeById: (id: string) => Promise.resolve(trees[id] ?? null),
}));

const SPONSOR = 'GSPONSORONE';
// Monday 2026-10-19
const MONDAY = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  resetFieldMessagingForTest();
  setTranslationProviderForTest({
    translate: (text, from, to) => Promise.resolve(`[${from}>${to}] ${text}`),
  });
});

afterEach(() => {
  setTranslationProviderForTest(undefined);
  vi.restoreAllMocks();
});

describe('sponsor messages', () => {
  it('starts with an empty thread and no pending reply', async () => {
    const thread = await getSponsorThread('tree-007', SPONSOR, 'en', MONDAY);

    expect(thread.messages).toEqual([]);
    expect(thread.replyDueAt).toBeNull();
    expect(thread.overdue).toBe(false);
    expect(thread.slaBusinessDays).toBe(5);
  });

  it('stores a message and shows a 5 business day reply deadline', async () => {
    const thread = await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'How is my tree?', language: 'en' },
      MONDAY
    );

    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({ senderRole: 'sponsor', text: 'How is my tree?' });
    expect(thread.replyDueAt).toBe('2026-10-26T09:00:00.000Z');
    expect(thread.overdue).toBe(false);
  });

  it('does not translate when sponsor and field team share a language', async () => {
    const thread = await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'How is my tree?', language: 'en' },
      MONDAY
    );

    expect(thread.messages[0].translated).toBe(false);
    expect(thread.messages[0].translationUnavailable).toBe(false);
  });

  it('translates a Spanish sponsor message for the Hausa-speaking field team', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'Hola', language: 'es' },
      MONDAY
    );

    // Field team reads the thread in Hausa.
    const reply = await sendFieldTeamReply(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'Sannu' },
      MONDAY
    );
    const first = reply.messages[0];
    expect(first.text).toBe('[es>ha] Hola');
    expect(first.originalText).toBe('Hola');
    expect(first.translated).toBe(true);
  });

  it('keeps the deadline of the oldest unanswered message', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'First', language: 'en' },
      MONDAY
    );
    const thread = await sendSponsorMessage(
      {
        treeId: 'tree-007',
        sponsorId: SPONSOR,
        body: 'Second',
        language: 'en',
      },
      new Date('2026-10-21T09:00:00Z')
    );

    expect(thread.replyDueAt).toBe('2026-10-26T09:00:00.000Z');
  });

  it('flags a thread as overdue once the deadline has passed', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'Hello?', language: 'en' },
      MONDAY
    );

    const before = await getSponsorThread(
      'tree-007',
      SPONSOR,
      'en',
      new Date('2026-10-26T08:00:00Z')
    );
    const after = await getSponsorThread(
      'tree-007',
      SPONSOR,
      'en',
      new Date('2026-10-26T10:00:00Z')
    );

    expect(before.overdue).toBe(false);
    expect(after.overdue).toBe(true);
  });

  it('rejects empty and oversized messages', async () => {
    await expect(
      sendSponsorMessage({ treeId: 'tree-007', sponsorId: SPONSOR, body: '   ' }, MONDAY)
    ).rejects.toThrow(/Message is required/);
    await expect(
      sendSponsorMessage({ treeId: 'tree-007', sponsorId: SPONSOR, body: 'x'.repeat(2001) }, MONDAY)
    ).rejects.toThrow(/at most 2000/);
  });

  it('rejects a missing sponsor and an unknown tree', async () => {
    await expect(
      sendSponsorMessage({ treeId: 'tree-007', sponsorId: '', body: 'Hi' }, MONDAY)
    ).rejects.toThrow(/Sponsor id is required/);
    await expect(
      sendSponsorMessage({ treeId: 'nope', sponsorId: SPONSOR, body: 'Hi' }, MONDAY)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('keeps each sponsor thread private', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'Private', language: 'en' },
      MONDAY
    );

    const other = await getSponsorThread('tree-007', 'GSPONSORTWO', 'en', MONDAY);
    expect(other.messages).toEqual([]);
  });
});

describe('field team replies', () => {
  it('translates a Hausa reply for an English sponsor and clears the pending deadline', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'How is it?', language: 'en' },
      MONDAY
    );
    const afterReply = await sendFieldTeamReply(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'Yana lafiya' },
      new Date('2026-10-20T09:00:00Z')
    );
    expect(afterReply.replyDueAt).toBeNull();

    const sponsorView = await getSponsorThread('tree-001', SPONSOR, 'en', MONDAY);
    const reply = sponsorView.messages[1];
    expect(reply.senderRole).toBe('field_team');
    expect(reply.text).toBe('[ha>en] Yana lafiya');
    expect(reply.originalText).toBe('Yana lafiya');
    expect(reply.translated).toBe(true);
  });

  it('cannot reply to a thread that does not exist', async () => {
    await expect(
      sendFieldTeamReply({ treeId: 'tree-001', sponsorId: SPONSOR, body: 'Hi' }, MONDAY)
    ).rejects.toBeInstanceOf(FieldMessagingError);
  });

  it('starts a new deadline when the sponsor writes again after a reply', async () => {
    await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'One', language: 'en' },
      MONDAY
    );
    await sendFieldTeamReply(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'Answer' },
      new Date('2026-10-20T09:00:00Z')
    );
    const thread = await sendSponsorMessage(
      { treeId: 'tree-007', sponsorId: SPONSOR, body: 'Two', language: 'en' },
      new Date('2026-10-21T09:00:00Z')
    );

    expect(thread.replyDueAt).toBe('2026-10-28T09:00:00.000Z');
  });
});

describe('when translation is not available', () => {
  it('still delivers the message and flags it as untranslated', async () => {
    setTranslationProviderForTest(null);

    await sendSponsorMessage(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'Hola', language: 'es' },
      MONDAY
    );
    const reply = await sendFieldTeamReply(
      { treeId: 'tree-001', sponsorId: SPONSOR, body: 'Sannu' },
      MONDAY
    );

    expect(reply.messages[0]).toMatchObject({
      text: 'Hola',
      translated: false,
      translationUnavailable: true,
    });
  });
});
