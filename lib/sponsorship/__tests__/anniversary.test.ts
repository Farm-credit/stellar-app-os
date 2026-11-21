import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendSponsorshipAnniversaryEmail } from '@/lib/email/sendgrid';
import type { Tree } from '@/lib/types/tree';
import {
  buildSponsorshipRecords,
  displayNameFromEmail,
  findDueAnniversaries,
  isAnniversaryOn,
  resetAnniversaryLedger,
  sendDueAnniversaryReminders,
  yearsSincePlanted,
  type SponsorshipRecord,
} from '../anniversary';

vi.mock('@/lib/email/sendgrid', () => ({
  sendSponsorshipAnniversaryEmail: vi.fn(() => Promise.resolve(true)),
}));

const emailMock = vi.mocked(sendSponsorshipAnniversaryEmail);

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    id: 'tree-test-1',
    treeId: 'HRV-2024-0001',
    species: 'Teak',
    region: 'Kano, Nigeria',
    status: 'verified',
    plantedAt: '2024-03-12T08:00:00Z',
    lat: 12.04,
    lng: 8.48,
    co2OffsetKgPerYear: 22,
    projectName: 'Northern Savanna Reforestation',
    ...overrides,
  };
}

const RECORD: SponsorshipRecord = {
  sponsorEmail: 'sponsor@example.org',
  sponsorName: 'Test Sponsor',
  tree: makeTree(),
};

describe('Sponsorship anniversary reminders (Issue #1647)', () => {
  beforeEach(() => {
    emailMock.mockClear();
    emailMock.mockResolvedValue(true);
    resetAnniversaryLedger();
  });

  describe('anniversary date logic', () => {
    it('matches the planting month/day in later years only', () => {
      expect(isAnniversaryOn('2024-03-12T08:00:00Z', new Date('2026-03-12T12:00:00Z'))).toBe(true);
      expect(isAnniversaryOn('2024-03-12T08:00:00Z', new Date('2026-03-13T12:00:00Z'))).toBe(false);
      // The planting year itself is not an anniversary.
      expect(isAnniversaryOn('2024-03-12T08:00:00Z', new Date('2024-03-12T12:00:00Z'))).toBe(false);
      expect(isAnniversaryOn('not-a-date', new Date('2026-03-12T12:00:00Z'))).toBe(false);
    });

    it('counts full years since planting', () => {
      expect(yearsSincePlanted('2024-03-12T08:00:00Z', new Date('2026-03-12T12:00:00Z'))).toBe(2);
      expect(yearsSincePlanted('2024-03-12T08:00:00Z', new Date('2024-04-01T00:00:00Z'))).toBe(0);
    });

    it('builds display names from sponsor emails', () => {
      expect(displayNameFromEmail('alice.johnson@greenearth.org')).toBe('Alice Johnson');
      expect(displayNameFromEmail('james.oduya@carboncred.ke')).toBe('James Oduya');
      expect(displayNameFromEmail('solo@ecofund.io')).toBe('Solo');
    });
  });

  describe('due reminder enrichment', () => {
    it('enriches a due reminder with CO₂, photo and share links', () => {
      const due = findDueAnniversaries([RECORD], new Date('2026-03-12T12:00:00Z'));

      expect(due).toHaveLength(1);
      const reminder = due[0];
      expect(reminder.sponsorEmail).toBe(RECORD.sponsorEmail);
      expect(reminder.yearsOld).toBe(2);
      expect(reminder.anniversaryDate).toBe('2026-03-12');
      expect(reminder.cumulativeCo2Kg).toBeGreaterThan(0);
      expect(reminder.annualCo2Kg).toBe(22);
      expect(reminder.latestPhotoUrl).toMatch(/^https?:\/\//);
      expect(reminder.shareUrl).toContain('HRV-2024-0001');
      expect(reminder.ogImageUrl).toContain('/opengraph-image');
    });

    it('returns nothing on days that are not the planting anniversary', () => {
      expect(findDueAnniversaries([RECORD], new Date('2026-03-13T12:00:00Z'))).toHaveLength(0);
    });

    it('skips unplanted and failed trees', () => {
      const unplanted = [{ ...RECORD, tree: makeTree({ plantedAt: undefined }) }];
      const failed = [{ ...RECORD, tree: makeTree({ status: 'failed' }) }];
      const now = new Date('2026-03-12T12:00:00Z');
      expect(findDueAnniversaries(unplanted, now)).toHaveLength(0);
      expect(findDueAnniversaries(failed, now)).toHaveLength(0);
    });
  });

  describe('sending', () => {
    it('emails each due reminder exactly once per year', async () => {
      const now = new Date('2026-03-12T12:00:00Z');

      const first = await sendDueAnniversaryReminders({ now, records: [RECORD] });
      expect(first).toEqual({ due: 1, sent: 1, skipped: 0 });
      expect(emailMock).toHaveBeenCalledTimes(1);
      expect(emailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'sponsor@example.org',
          subject: expect.stringContaining('HRV-2024-0001'),
        })
      );

      const second = await sendDueAnniversaryReminders({ now, records: [RECORD] });
      expect(second).toEqual({ due: 1, sent: 0, skipped: 1 });
      expect(emailMock).toHaveBeenCalledTimes(1);

      resetAnniversaryLedger();
      await sendDueAnniversaryReminders({ now, records: [RECORD] });
      expect(emailMock).toHaveBeenCalledTimes(2);
    });

    it('counts an unconfigured mail provider as not sent without retry storms', async () => {
      emailMock.mockResolvedValue(false);
      const now = new Date('2026-03-12T12:00:00Z');

      const summary = await sendDueAnniversaryReminders({ now, records: [RECORD] });
      expect(summary).toEqual({ due: 1, sent: 0, skipped: 0 });

      const retry = await sendDueAnniversaryReminders({ now, records: [RECORD] });
      expect(retry).toEqual({ due: 1, sent: 0, skipped: 1 });
    });
  });

  describe('sponsorship records', () => {
    it('attributes only planted, non-failed trees to active sponsors', () => {
      const records = buildSponsorshipRecords();
      expect(records.length).toBeGreaterThan(0);

      const pairs = new Set<string>();
      for (const record of records) {
        expect(record.tree.plantedAt).toBeTruthy();
        expect(record.tree.status).not.toBe('failed');
        expect(record.sponsorEmail).toContain('@');
        const key = `${record.sponsorEmail}|${record.tree.id}`;
        expect(pairs.has(key)).toBe(false);
        pairs.add(key);
      }
    });

    it('finds a real anniversary from the attributed records', () => {
      const records = buildSponsorshipRecords();
      const record = records.find((r) => r.tree.plantedAt);
      expect(record).toBeDefined();

      const planted = new Date(record!.tree.plantedAt!);
      const now = new Date(
        Date.UTC(planted.getUTCFullYear() + 1, planted.getUTCMonth(), planted.getUTCDate(), 12)
      );

      const due = findDueAnniversaries([record!], now);
      expect(due).toHaveLength(1);
      expect(due[0].tree.treeId).toBe(record!.tree.treeId);
      expect(due[0].yearsOld).toBe(1);
    });
  });
});
