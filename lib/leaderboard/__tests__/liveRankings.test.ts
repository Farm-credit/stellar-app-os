import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_WINDOW_MS,
  buildLeaderboardSnapshot,
  parseLeaderboardQuery,
  rankSponsors,
  type LeaderboardQuery,
  type SponsorshipEvent,
} from '@/lib/leaderboard/liveRankings';
import {
  MAX_SIMULATED_PER_TICK,
  SIMULATION_INTERVAL_MS,
  createSponsorshipStore,
  seededRandom,
} from '@/lib/leaderboard/sponsorshipStore';
import { CO2_KG_PER_TREE_PER_YEAR } from '@/lib/constants/impact';

const NOW = new Date('2026-06-01T12:00:00Z');
const GLOBAL: LeaderboardQuery = { scope: 'global', limit: 25 };

let seq = 0;
function ev(
  sponsorId: string,
  trees: number,
  hoursAgo: number,
  extra: Partial<SponsorshipEvent> = {}
): SponsorshipEvent {
  return {
    id: `e${++seq}`,
    sponsorId,
    sponsorName: sponsorId.toUpperCase(),
    region: 'Africa',
    treeType: 'Fruit',
    trees,
    occurredAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    ...extra,
  };
}

describe('parseLeaderboardQuery', () => {
  it('defaults to a global top 25', () => {
    expect(parseLeaderboardQuery(new URLSearchParams())).toEqual({
      ok: true,
      query: { scope: 'global', region: undefined, treeType: undefined, limit: 25 },
    });
  });

  it('parses regional and tree-type scopes', () => {
    const regional = parseLeaderboardQuery(
      new URLSearchParams('scope=region&region=Asia&limit=10')
    );
    expect(regional.ok && regional.query).toMatchObject({
      scope: 'region',
      region: 'Asia',
      limit: 10,
    });

    const byType = parseLeaderboardQuery(new URLSearchParams('scope=tree-type&treeType=Mangrove'));
    expect(byType.ok && byType.query).toMatchObject({ scope: 'tree-type', treeType: 'Mangrove' });
  });

  it('rejects invalid combinations', () => {
    const result = parseLeaderboardQuery(
      new URLSearchParams('scope=region&treeType=Cactus&limit=500')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
    }
  });
});

describe('rankSponsors', () => {
  it('ranks by total trees with competition ranking for ties', () => {
    const ranked = rankSponsors([
      ev('a', 10, 1),
      ev('b', 30, 1),
      ev('c', 30, 2),
      ev('d', 5, 1),
      ev('a', 15, 3),
    ]);
    expect(ranked.map((r) => [r.sponsorId, r.rank, r.trees])).toEqual([
      ['b', 1, 30],
      ['c', 1, 30],
      ['a', 3, 25],
      ['d', 4, 5],
    ]);
  });

  it('reports CO₂, favourite tree type and last activity', () => {
    const [top] = rankSponsors([
      ev('a', 3, 5, { treeType: 'Fruit' }),
      ev('a', 7, 2, { treeType: 'Mangrove' }),
    ]);
    expect(top.co2KgPerYear).toBe(10 * CO2_KG_PER_TREE_PER_YEAR);
    expect(top.topTreeType).toBe('Mangrove');
    expect(top.lastSponsoredAt).toBe(new Date(NOW.getTime() - 2 * 3_600_000).toISOString());
  });
});

describe('buildLeaderboardSnapshot', () => {
  it('filters by region and tree type', () => {
    const events = [
      ev('a', 10, 1, { region: 'Asia', treeType: 'Mangrove' }),
      ev('b', 20, 1, { region: 'Europe', treeType: 'Mangrove' }),
      ev('c', 30, 1, { region: 'Asia', treeType: 'Fruit' }),
    ];
    const asia = buildLeaderboardSnapshot(
      events,
      { scope: 'region', region: 'Asia', limit: 10 },
      NOW
    );
    expect(asia.rankings.map((r) => r.sponsorId)).toEqual(['c', 'a']);
    expect(asia.totals.trees).toBe(40);

    const mangrove = buildLeaderboardSnapshot(
      events,
      { scope: 'tree-type', treeType: 'Mangrove', limit: 10 },
      NOW
    );
    expect(mangrove.rankings.map((r) => r.sponsorId)).toEqual(['b', 'a']);
  });

  it('tracks movement against rankings from 24 hours earlier', () => {
    const hours = MOVEMENT_WINDOW_MS / 3_600_000;
    const events = [
      ev('a', 50, hours + 5),
      ev('b', 40, hours + 5),
      ev('b', 30, 1), // b overtakes a today
      ev('c', 5, 1), // c is new today
    ];
    const snapshot = buildLeaderboardSnapshot(events, GLOBAL, NOW);
    const byId = Object.fromEntries(snapshot.rankings.map((r) => [r.sponsorId, r]));
    expect(byId.b).toMatchObject({ rank: 1, movement: 1, isNew: false });
    expect(byId.a).toMatchObject({ rank: 2, movement: -1, isNew: false });
    expect(byId.c).toMatchObject({ rank: 3, movement: 0, isNew: true });
  });

  it('applies the limit to rankings but not to totals', () => {
    const events = ['a', 'b', 'c', 'd'].map((id, i) => ev(id, 10 + i, 1));
    const snapshot = buildLeaderboardSnapshot(events, { scope: 'global', limit: 2 }, NOW);
    expect(snapshot.rankings).toHaveLength(2);
    expect(snapshot.totals).toEqual({
      trees: 46,
      sponsors: 4,
      co2KgPerYear: 46 * CO2_KG_PER_TREE_PER_YEAR,
    });
  });

  it('ignores future-dated events and lists recent activity newest first', () => {
    const events = [ev('a', 1, 3), ev('b', 1, 1), ev('c', 100, -1)];
    const snapshot = buildLeaderboardSnapshot(events, GLOBAL, NOW);
    expect(snapshot.rankings.map((r) => r.sponsorId)).not.toContain('c');
    expect(snapshot.recent.map((e) => e.sponsorId)).toEqual(['b', 'a']);
  });
});

describe('sponsorship store', () => {
  it('seeds deterministic history in the past', () => {
    const a = createSponsorshipStore({ now: NOW, random: seededRandom(7) });
    const b = createSponsorshipStore({ now: NOW, random: seededRandom(7) });
    expect(a.events().length).toBeGreaterThan(100);
    expect(a.events()).toEqual(b.events());
    expect(a.events().every((e) => e.occurredAt <= NOW.toISOString())).toBe(true);
  });

  it('adds simulated sponsorships as time passes, capped per tick', () => {
    const store = createSponsorshipStore({ now: NOW, random: seededRandom(1) });
    const before = store.events().length;

    expect(store.tick(new Date(NOW.getTime() + SIMULATION_INTERVAL_MS - 1))).toHaveLength(0);
    expect(store.tick(new Date(NOW.getTime() + SIMULATION_INTERVAL_MS * 3))).toHaveLength(3);
    expect(store.tick(new Date(NOW.getTime() + SIMULATION_INTERVAL_MS * 1000))).toHaveLength(
      MAX_SIMULATED_PER_TICK
    );
    expect(store.events().length).toBe(before + 3 + MAX_SIMULATED_PER_TICK);
  });

  it('does not simulate when disabled', () => {
    const store = createSponsorshipStore({ now: NOW, simulate: false });
    expect(store.tick(new Date(NOW.getTime() + 60_000))).toEqual([]);
  });

  it('records real sponsorships and validates them', () => {
    const store = createSponsorshipStore({ now: NOW, simulate: false });
    store.record(ev('real', 3, 0));
    expect(store.events().at(-1)?.sponsorId).toBe('real');
    expect(() => store.record(ev('bad', 0, 0))).toThrow(RangeError);
  });
});
