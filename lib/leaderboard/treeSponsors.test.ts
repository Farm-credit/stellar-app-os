// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import {
  getTreeSponsorLeaderboard,
  getLeaderboardPreferences,
  saveLeaderboardPreferences,
} from './treeSponsors';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));
let db: PGlite;
const now = new Date('2026-11-15T12:00:00Z');
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE TABLE sponsorship_events (wallet TEXT, trees_funded INT, funded_at TIMESTAMPTZ);`
  );
  await db.exec(
    readFileSync(
      new URL(
        '../../db/migrations/035_create_sponsor_leaderboard_preferences.sql',
        import.meta.url
      ),
      'utf8'
    )
  );
  query.mockImplementation((sql: string, params: unknown[]) => db.query(sql, params));
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec('TRUNCATE sponsorship_events, sponsor_leaderboard_preferences');
});
async function sponsor(
  wallet: string,
  trees: number,
  date: string,
  type: 'individual' | 'corporate' = 'individual',
  optedIn = true
) {
  await saveLeaderboardPreferences(wallet, { optedIn, displayName: wallet, sponsorType: type });
  await db.query('INSERT INTO sponsorship_events VALUES ($1,$2,$3)', [wallet, trees, date]);
}

describe('persisted tree sponsorship rankings', () => {
  it('keeps new wallets private and never publishes opted-out wallets', async () => {
    expect(await getLeaderboardPreferences('new-wallet')).toEqual({
      optedIn: false,
      displayName: '',
      sponsorType: 'individual',
    });
    await sponsor('Private', 1000, '2026-11-02', 'individual', false);
    await sponsor('Visible', 2, '2026-11-02');
    const result = await getTreeSponsorLeaderboard('all-time', 'individual', now);
    expect(result.entries).toEqual([{ rank: 1, displayName: 'Visible', trees: 2 }]);
    expect(JSON.stringify(result)).not.toContain('wallet');
  });
  it('uses UTC month boundaries, excludes future events, and sums each wallet', async () => {
    await sponsor('Alice', 10, '2026-10-31T23:59:59Z');
    await sponsor('Alice', 5, '2026-11-01T00:00:00Z');
    await sponsor('Alice', 500, '2026-12-01');
    await sponsor('Alice', -20, '2026-11-02');
    expect((await getTreeSponsorLeaderboard('monthly', 'individual', now)).entries[0].trees).toBe(
      5
    );
    expect((await getTreeSponsorLeaderboard('all-time', 'individual', now)).entries[0].trees).toBe(
      15
    );
  });
  it('separates corporate rankings and assigns competition ranks deterministically', async () => {
    await sponsor('Zoe', 10, '2026-11-02');
    await sponsor('Alice', 10, '2026-11-02');
    await sponsor('Bob', 2, '2026-11-02');
    await sponsor('Company', 100, '2026-11-02', 'corporate');
    expect((await getTreeSponsorLeaderboard('monthly', 'individual', now)).entries).toEqual([
      { rank: 1, displayName: 'Alice', trees: 10 },
      { rank: 1, displayName: 'Zoe', trees: 10 },
      { rank: 3, displayName: 'Bob', trees: 2 },
    ]);
    expect((await getTreeSponsorLeaderboard('monthly', 'corporate', now)).entries).toEqual([
      { rank: 1, displayName: 'Company', trees: 100 },
    ]);
  });
  it('removes consent immediately from both periods and retains it across reads', async () => {
    await sponsor('Alice', 3, '2026-11-02');
    await saveLeaderboardPreferences('Alice', {
      optedIn: false,
      displayName: 'Alice',
      sponsorType: 'individual',
    });
    expect((await getLeaderboardPreferences('Alice')).optedIn).toBe(false);
    for (const period of ['monthly', 'all-time'] as const)
      expect((await getTreeSponsorLeaderboard(period, 'individual', now)).entries).toEqual([]);
  });
  it('reflects new sponsorships on the next query and returns empty periods', async () => {
    expect((await getTreeSponsorLeaderboard('monthly', 'individual', now)).entries).toEqual([]);
    await sponsor('Alice', 1, '2026-11-02');
    expect((await getTreeSponsorLeaderboard('monthly', 'individual', now)).entries[0].trees).toBe(
      1
    );
    await sponsor('Alice', 4, '2026-11-03');
    expect((await getTreeSponsorLeaderboard('monthly', 'individual', now)).entries[0].trees).toBe(
      5
    );
  });
});
