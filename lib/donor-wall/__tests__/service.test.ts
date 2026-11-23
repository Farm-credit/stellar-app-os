import { describe, expect, it, vi } from 'vitest';
import {
  buildDonorWallEntries,
  getDonorWall,
  saveRecognitionSettings,
  SNAPSHOT_MAX_AGE_MS,
  type DonorWallEntry,
} from '../service';
import { recognitionSettingsSchema } from '../schema';

const NOW = new Date('2026-10-21T12:00:00Z');
const A = 'GA'.padEnd(56, 'A');
const B = 'GB'.padEnd(56, 'B');

function entry(wallet: string, name: string, totalTrees: number, tier: DonorWallEntry['tier']) {
  return { wallet, name, logoUrl: null, totalTrees, tier } satisfies DonorWallEntry;
}

/** Routes each query to a canned result by matching its SQL. */
function fakePool(handlers: Record<string, unknown[]>) {
  const query = vi.fn(async (sql: string) => {
    const key = Object.keys(handlers).find((k) => sql.includes(k));
    return { rows: key ? handlers[key] : [] };
  });
  return { query } as unknown as Parameters<typeof getDonorWall>[0] & { query: typeof query };
}

describe('buildDonorWallEntries', () => {
  it('only selects opted-in sponsors, sums trees and applies the 10-tree minimum', async () => {
    const pool = fakePool({
      'FROM sponsor_recognition_settings s': [
        { wallet: A, display_name: 'Acme', logo_url: null, total_trees: 1200 },
        { wallet: B, display_name: 'Beta', logo_url: 'https://x.test/b.png', total_trees: 12 },
      ],
    });
    const entries = await buildDonorWallEntries(pool);

    const sql = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('recognition_opt_in = TRUE');
    expect(sql).toContain('SUM(e.trees_funded)');
    expect(pool.query.mock.calls[0][1]).toContain(10);
    expect(entries.map((e) => [e.name, e.tier])).toEqual([
      ['Acme', 'platinum'],
      ['Beta', 'bronze'],
    ]);
  });
});

describe('getDonorWall', () => {
  it('rebuilds the snapshot when none exists', async () => {
    const pool = fakePool({
      'SELECT generated_at': [],
      'FROM sponsor_recognition_settings s': [
        { wallet: A, display_name: 'Acme', logo_url: null, total_trees: 60 },
      ],
      'WHERE recognition_opt_in = TRUE AND wallet = ANY': [
        { wallet: A, display_name: 'Acme', logo_url: null },
      ],
    });
    const wall = await getDonorWall(pool, NOW);

    expect(
      pool.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO donor_wall_snapshot'))
    ).toBe(true);
    expect(wall.entries).toEqual([{ name: 'Acme', logoUrl: null, totalTrees: 60, tier: 'silver' }]);
  });

  it('rebuilds a snapshot that is 7+ days old', async () => {
    const stale = new Date(NOW.getTime() - SNAPSHOT_MAX_AGE_MS);
    const pool = fakePool({
      'SELECT generated_at': [{ generated_at: stale, entries: [] }],
    });
    await getDonorWall(pool, NOW);
    expect(
      pool.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO donor_wall_snapshot'))
    ).toBe(true);
  });

  it('serves a fresh snapshot without rebuilding, and never exposes wallets', async () => {
    const fresh = new Date(NOW.getTime() - 60_000);
    const pool = fakePool({
      'SELECT generated_at': [{ generated_at: fresh, entries: [entry(A, 'Acme', 250, 'gold')] }],
      'WHERE recognition_opt_in = TRUE AND wallet = ANY': [
        { wallet: A, display_name: 'Acme', logo_url: 'https://x.test/a.png' },
      ],
    });
    const wall = await getDonorWall(pool, NOW);

    expect(
      pool.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO donor_wall_snapshot'))
    ).toBe(false);
    expect(wall.entries).toEqual([
      { name: 'Acme', logoUrl: 'https://x.test/a.png', totalTrees: 250, tier: 'gold' },
    ]);
    expect(JSON.stringify(wall)).not.toContain(A);
  });

  it('drops sponsors who opted out after the snapshot was taken', async () => {
    const fresh = new Date(NOW.getTime() - 60_000);
    const pool = fakePool({
      'SELECT generated_at': [
        {
          generated_at: fresh,
          entries: [entry(A, 'Acme', 250, 'gold'), entry(B, 'Beta', 80, 'silver')],
        },
      ],
      // only B is still opted in
      'WHERE recognition_opt_in = TRUE AND wallet = ANY': [
        { wallet: B, display_name: 'Beta', logo_url: null },
      ],
    });
    const wall = await getDonorWall(pool, NOW);
    expect(wall.entries.map((e) => e.name)).toEqual(['Beta']);
  });

  it('returns an empty wall when nobody has opted in', async () => {
    const pool = fakePool({ 'SELECT generated_at': [] });
    const wall = await getDonorWall(pool, NOW);
    expect(wall.entries).toEqual([]);
  });
});

describe('recognition settings', () => {
  it('requires a display name when opting in', () => {
    const result = recognitionSettingsSchema.safeParse({
      recognitionOptIn: true,
      displayName: '',
      logoUrl: '',
    });
    expect(result.success).toBe(false);
  });

  it('allows opting out without a name and rejects non-https logos', () => {
    expect(recognitionSettingsSchema.safeParse({ recognitionOptIn: false }).success).toBe(true);
    expect(
      recognitionSettingsSchema.safeParse({
        recognitionOptIn: true,
        displayName: 'Acme',
        logoUrl: 'javascript:alert(1)',
      }).success
    ).toBe(false);
    expect(
      recognitionSettingsSchema.safeParse({
        recognitionOptIn: true,
        displayName: 'Acme',
        logoUrl: 'http://insecure.test/logo.png',
      }).success
    ).toBe(false);
  });

  it('upserts settings keyed by wallet, defaulting opt-in to what was sent', async () => {
    const pool = fakePool({
      'SELECT recognition_opt_in': [
        { recognition_opt_in: true, display_name: 'Acme', logo_url: null },
      ],
    });
    const saved = await saveRecognitionSettings(
      A,
      { recognitionOptIn: true, displayName: 'Acme', logoUrl: '' },
      pool
    );
    expect(pool.query.mock.calls[0][1]).toEqual([A, true, 'Acme', '']);
    expect(saved).toEqual({ recognitionOptIn: true, displayName: 'Acme', logoUrl: '' });
  });
});
