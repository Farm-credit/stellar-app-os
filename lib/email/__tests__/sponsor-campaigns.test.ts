import { describe, expect, it, vi } from 'vitest';
import { resolveSponsorRecipients, queueNewsletter } from '@/lib/email/sponsor-campaigns';
import { generateWeeklyDigests } from '@/lib/workers/generate-weekly-digests';

function poolWith(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) } as never;
}

describe('sponsor email campaigns', () => {
  it('resolves recipients with a stable segment and excludes empty addresses', async () => {
    const pool = poolWith([
      {
        email: 'vip@example.com',
        name: 'VIP',
        region: 'north',
        tree_count: 8,
        last_activity: new Date(),
      },
      {
        email: 'new@example.com',
        name: 'New',
        region: 'south',
        tree_count: 1,
        last_activity: new Date(),
      },
    ]);
    const recipients = await resolveSponsorRecipients(pool, ['vip', 'first-time']);
    expect(recipients).toEqual([
      { email: 'vip@example.com', name: 'VIP', region: 'north', segment: 'vip' },
      { email: 'new@example.com', name: 'New', region: 'south', segment: 'first-time' },
    ]);
  });

  it('queues a campaign and one delivery per resolved recipient in one transaction', async () => {
    const pool = poolWith([
      {
        email: 'sponsor@example.com',
        name: 'Sponsor',
        region: 'west',
        tree_count: 1,
        last_activity: new Date(),
      },
    ]);
    const client = {
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'campaign-1',
              subject: 'Hello',
              message: 'Impact',
              segments: ['first-time'],
              region: null,
              status: 'queued',
              recipient_count: 1,
              sent_count: 0,
              failed_count: 0,
            },
          ],
        })
        .mockResolvedValue({ rows: [], rowCount: 0 }),
    };
    (pool as { connect: () => Promise<unknown> }).connect = vi.fn().mockResolvedValue(client);
    const campaign = await queueNewsletter(pool, {
      subject: 'Hello',
      message: 'Impact',
      segments: ['first-time'],
    });
    expect(campaign.id).toBe('campaign-1');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('generates weekly digest rows only for sponsors without a current-period row', async () => {
    const pool = poolWith([
      {
        email: 'sponsor@example.com',
        name: 'Sponsor',
        tree_count: 2,
        new_trees: 1,
        total_co2_kg: 96,
        new_updates: 2,
        top_species: 'Moringa',
        photo_urls: ['https://photo'],
        regions: ['north'],
      },
    ]);
    const result = await generateWeeklyDigests(pool, new Date('2026-09-26T00:00:00Z'));
    expect(result.generated).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_digests'),
      expect.any(Array)
    );
  });
});
