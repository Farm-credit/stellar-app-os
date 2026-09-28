/**
 * In-memory sponsorship event store backing the live leaderboard (Issue #1100).
 *
 * Real sponsorships are pushed in with `record()`. Until the leaderboard reads
 * from the sponsorship tables, the store is seeded with deterministic history
 * and — unless LEADERBOARD_SIMULATION=off — trickles in simulated sponsorships
 * as time passes, so live counters move in demos and previews.
 */

import {
  SPONSOR_REGIONS,
  TREE_TYPES,
  type SponsorRegion,
  type SponsorshipEvent,
  type TreeType,
} from './liveRankings';

export interface SponsorProfile {
  sponsorId: string;
  sponsorName: string;
  region: SponsorRegion;
  /** Relative activity level; busier sponsors sponsor more often. */
  weight: number;
  favouriteTreeType: TreeType;
}

export const SEED_SPONSORS: SponsorProfile[] = [
  {
    sponsorId: 'sp-acme',
    sponsorName: 'Acme EcoSolutions',
    region: 'North America',
    weight: 9,
    favouriteTreeType: 'Native',
  },
  {
    sponsorId: 'sp-canopy',
    sponsorName: 'Canopy Org',
    region: 'Europe',
    weight: 8,
    favouriteTreeType: 'Hardwood',
  },
  {
    sponsorId: 'sp-cleanair',
    sponsorName: 'CleanAir Initiative',
    region: 'Asia',
    weight: 7,
    favouriteTreeType: 'Mangrove',
  },
  {
    sponsorId: 'sp-busters',
    sponsorName: 'Carbon Busters Ltd',
    region: 'Europe',
    weight: 6,
    favouriteTreeType: 'Native',
  },
  {
    sponsorId: 'sp-greenroots',
    sponsorName: 'GreenRoots Collective',
    region: 'Africa',
    weight: 8,
    favouriteTreeType: 'Agroforestry',
  },
  {
    sponsorId: 'sp-selva',
    sponsorName: 'Selva Viva',
    region: 'Latin America',
    weight: 7,
    favouriteTreeType: 'Hardwood',
  },
  {
    sponsorId: 'sp-reef',
    sponsorName: 'Reef & Root',
    region: 'Oceania',
    weight: 5,
    favouriteTreeType: 'Mangrove',
  },
  {
    sponsorId: 'sp-orchard',
    sponsorName: 'Orchard Futures',
    region: 'Africa',
    weight: 6,
    favouriteTreeType: 'Fruit',
  },
  {
    sponsorId: 'sp-amani',
    sponsorName: 'Amani Family Trust',
    region: 'Africa',
    weight: 4,
    favouriteTreeType: 'Fruit',
  },
  {
    sponsorId: 'sp-sakura',
    sponsorName: 'Sakura Green Fund',
    region: 'Asia',
    weight: 5,
    favouriteTreeType: 'Native',
  },
  {
    sponsorId: 'sp-northwind',
    sponsorName: 'Northwind Logistics',
    region: 'Europe',
    weight: 4,
    favouriteTreeType: 'Hardwood',
  },
  {
    sponsorId: 'sp-maple',
    sponsorName: 'Maple Leaf Schools',
    region: 'North America',
    weight: 3,
    favouriteTreeType: 'Fruit',
  },
  {
    sponsorId: 'sp-andes',
    sponsorName: 'Andes Coffee Co-op',
    region: 'Latin America',
    weight: 4,
    favouriteTreeType: 'Agroforestry',
  },
  {
    sponsorId: 'sp-outback',
    sponsorName: 'Outback Rewilding',
    region: 'Oceania',
    weight: 3,
    favouriteTreeType: 'Native',
  },
  {
    sponsorId: 'sp-delta',
    sponsorName: 'Delta Blue Carbon',
    region: 'Asia',
    weight: 4,
    favouriteTreeType: 'Mangrove',
  },
  {
    sponsorId: 'sp-harvest',
    sponsorName: 'Harvest Moon Bakery',
    region: 'North America',
    weight: 2,
    favouriteTreeType: 'Fruit',
  },
  {
    sponsorId: 'sp-sahel',
    sponsorName: 'Sahel Rising',
    region: 'Africa',
    weight: 3,
    favouriteTreeType: 'Agroforestry',
  },
  {
    sponsorId: 'sp-fjord',
    sponsorName: 'Fjord Families',
    region: 'Europe',
    weight: 2,
    favouriteTreeType: 'Native',
  },
];

export const SEED_HISTORY_DAYS = 60;
export const SIMULATION_INTERVAL_MS = 4_000;
/** Caps how many simulated events one tick can add after a long idle period. */
export const MAX_SIMULATED_PER_TICK = 12;
const MAX_STORED_EVENTS = 50_000;

export type Random = () => number;

/** Small, fast, seedable PRNG (mulberry32). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(sponsors: SponsorProfile[], random: Random): SponsorProfile {
  const total = sponsors.reduce((sum, s) => sum + s.weight, 0);
  let roll = random() * total;
  for (const sponsor of sponsors) {
    roll -= sponsor.weight;
    if (roll < 0) return sponsor;
  }
  return sponsors[sponsors.length - 1];
}

function makeEvent(
  id: string,
  sponsor: SponsorProfile,
  random: Random,
  occurredAt: Date
): SponsorshipEvent {
  // Sponsors mostly stick with their favourite tree type.
  const treeType =
    random() < 0.7
      ? sponsor.favouriteTreeType
      : TREE_TYPES[Math.floor(random() * TREE_TYPES.length)];
  return {
    id,
    sponsorId: sponsor.sponsorId,
    sponsorName: sponsor.sponsorName,
    region: sponsor.region,
    treeType,
    trees: 1 + Math.floor(random() * 5 * sponsor.weight),
    occurredAt: occurredAt.toISOString(),
  };
}

export interface SponsorshipStoreOptions {
  now?: Date;
  random?: Random;
  sponsors?: SponsorProfile[];
  simulate?: boolean;
}

export interface SponsorshipStore {
  events(): readonly SponsorshipEvent[];
  record(event: SponsorshipEvent): void;
  /** Adds simulated sponsorships for the time elapsed since the last tick. */
  tick(now?: Date): SponsorshipEvent[];
}

export function createSponsorshipStore(options: SponsorshipStoreOptions = {}): SponsorshipStore {
  const random = options.random ?? seededRandom(1100);
  const sponsors = options.sponsors ?? SEED_SPONSORS;
  const simulate = options.simulate ?? true;
  const createdAt = options.now ?? new Date();

  const events: SponsorshipEvent[] = [];
  let sequence = 0;
  let lastTick = createdAt.getTime();

  // Seed history: roughly 4 sponsorships per unit of sponsor weight.
  const historyMs = SEED_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const seedCount = sponsors.reduce((sum, s) => sum + s.weight, 0) * 4;
  for (let i = 0; i < seedCount; i++) {
    const at = new Date(createdAt.getTime() - Math.floor(random() * historyMs));
    events.push(makeEvent(`seed-${++sequence}`, pickWeighted(sponsors, random), random, at));
  }
  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  function append(event: SponsorshipEvent) {
    events.push(event);
    if (events.length > MAX_STORED_EVENTS) events.splice(0, events.length - MAX_STORED_EVENTS);
  }

  return {
    events: () => events,

    record(event) {
      if (!Number.isInteger(event.trees) || event.trees < 1) {
        throw new RangeError('trees must be a positive integer');
      }
      if (!SPONSOR_REGIONS.includes(event.region) || !TREE_TYPES.includes(event.treeType)) {
        throw new RangeError('unknown region or tree type');
      }
      append(event);
    },

    tick(now = new Date()) {
      if (!simulate) return [];
      const elapsed = now.getTime() - lastTick;
      const due = Math.floor(elapsed / SIMULATION_INTERVAL_MS);
      if (due <= 0) return [];

      const count = Math.min(due, MAX_SIMULATED_PER_TICK);
      const added: SponsorshipEvent[] = [];
      for (let i = 0; i < count; i++) {
        // Spread the new events across the elapsed window, oldest first.
        const at = new Date(now.getTime() - Math.floor(((count - 1 - i) * elapsed) / count));
        const event = makeEvent(`live-${++sequence}`, pickWeighted(sponsors, random), random, at);
        append(event);
        added.push(event);
      }
      lastTick += due * SIMULATION_INTERVAL_MS;
      return added;
    },
  };
}

let defaultStore: SponsorshipStore | null = null;

/** Process-wide store used by the leaderboard API. */
export function getSponsorshipStore(): SponsorshipStore {
  if (!defaultStore) {
    defaultStore = createSponsorshipStore({
      simulate: process.env.LEADERBOARD_SIMULATION !== 'off',
    });
  }
  return defaultStore;
}
