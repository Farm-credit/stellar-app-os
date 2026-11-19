/**
 * Unit tests for the carbon price module — Issue #1388
 */

import { describe, expect, it, vi } from 'vitest';
import {
  CarbonPriceError,
  aggregateCarbonPrices,
  aggregateSeries,
  buildDailySeries,
  createCatalogPriceSource,
  getCarbonPriceHistory,
  parseCarbonPriceHistoryQuery,
  parseCarbonPriceQuery,
  parseCarbonPriceRequest,
  type CarbonPricePoint,
  type CarbonPriceSeriesRecord,
  type CarbonPriceSource,
} from './carbon-prices';

const RECORD: CarbonPriceSeriesRecord = {
  assetCode: 'CARBON-PROJ-004-2024',
  projectId: 'PROJ-004',
  projectName: 'Mangrove Restoration - Indonesia',
  projectType: 'Mangrove Restoration',
  region: 'southeast-asia',
  standard: 'Plan Vivo',
  basePricePerTon: 42.5,
  volume24h: 6_120,
  updatedAt: '2026-09-26T12:00:00Z',
};

const SECOND_RECORD: CarbonPriceSeriesRecord = {
  assetCode: 'CARBON-PROJ-002-2024',
  projectId: 'PROJ-002',
  projectName: 'Solar Cookstoves - Kenya',
  projectType: 'Renewable Energy',
  region: 'africa',
  standard: 'Gold Standard',
  basePricePerTon: 12.5,
  volume24h: 30_000,
  updatedAt: '2026-09-26T12:00:00Z',
};

const SERIES: CarbonPricePoint[] = [
  { at: '2026-09-01', pricePerTon: 10, volume: 1 },
  { at: '2026-09-02', pricePerTon: 12, volume: 2 },
  { at: '2026-09-03', pricePerTon: 14, volume: 3 },
  { at: '2026-09-04', pricePerTon: 16, volume: 4 },
  { at: '2026-09-05', pricePerTon: 20, volume: 5 },
];

function stubSource(overrides: Partial<CarbonPriceSource> = {}): CarbonPriceSource {
  return {
    sourceId: 'stub',
    async listQuotes() {
      return [RECORD, SECOND_RECORD];
    },
    async getDailySeries(assetCode: string) {
      return assetCode === RECORD.assetCode ? SERIES : null;
    },
    ...overrides,
  };
}

describe('parseCarbonPriceQuery', () => {
  it('accepts canonical filter values and the singular aliases', () => {
    const parsed = parseCarbonPriceQuery(
      new URLSearchParams('type=Reforestation&region=africa&standard=verra%20(vcs)&limit=5')
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.types).toEqual(['Reforestation']);
    expect(parsed.data.regions).toEqual(['africa']);
    expect(parsed.data.standards).toEqual(['Verra (VCS)']);
    expect(parsed.data.limit).toBe(5);
  });

  it('matches filter values case- and punctuation-insensitively', () => {
    const parsed = parseCarbonPriceQuery(new URLSearchParams('types=mangrove-restoration'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.types).toEqual(['Mangrove Restoration']);
  });

  it('rejects unknown filter values', () => {
    const parsed = parseCarbonPriceQuery(new URLSearchParams('types=Nuclear,Reforestation'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual(['Unknown types value: "Nuclear"']);
  });

  it('rejects out-of-range limits', () => {
    expect(parseCarbonPriceQuery(new URLSearchParams('limit=0')).ok).toBe(false);
    expect(parseCarbonPriceQuery(new URLSearchParams('limit=5000')).ok).toBe(false);
    expect(parseCarbonPriceQuery(new URLSearchParams('limit=abc')).ok).toBe(false);
  });

  it('accepts an empty query', () => {
    const parsed = parseCarbonPriceQuery(new URLSearchParams());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({});
  });
});

describe('parseCarbonPriceRequest', () => {
  it('rejects non-object bodies', () => {
    expect(parseCarbonPriceRequest([]).ok).toBe(false);
    expect(parseCarbonPriceRequest('nope').ok).toBe(false);
  });

  it('parses array and comma-separated filters', () => {
    const parsed = parseCarbonPriceRequest({
      types: ['Reforestation', 'Mangrove Restoration'],
      regions: 'africa,oceania',
      projectIds: 'PROJ-001',
      limit: 10,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.types).toEqual(['Reforestation', 'Mangrove Restoration']);
    expect(parsed.data.regions).toEqual(['africa', 'oceania']);
    expect(parsed.data.projectIds).toEqual(['PROJ-001']);
    expect(parsed.data.limit).toBe(10);
  });

  it('reports unknown standards and malformed id lists', () => {
    const parsed = parseCarbonPriceRequest({ standards: ['Acme Registry'], projectIds: [7] });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join(' ')).toContain('Unknown standards value');
    expect(parsed.errors.join(' ')).toContain('projectIds must contain only non-empty strings');
  });
});

describe('parseCarbonPriceHistoryQuery', () => {
  it('requires an asset code and defaults the interval to day', () => {
    expect(parseCarbonPriceHistoryQuery(new URLSearchParams()).ok).toBe(false);

    const parsed = parseCarbonPriceHistoryQuery(new URLSearchParams('assetCode=X'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual({ assetCode: 'X', interval: 'day' });
  });

  it('rejects unknown intervals and inverted ranges', () => {
    const bad = parseCarbonPriceHistoryQuery(
      new URLSearchParams('assetCode=X&interval=hour&from=2026-09-05&to=2026-09-01')
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('interval must be one of');
    expect(bad.errors.join(' ')).toContain('from must not be after to');
  });
});

describe('buildDailySeries', () => {
  const end = new Date('2026-09-26T12:00:00Z');

  it('is deterministic for the same asset and window', () => {
    const a = buildDailySeries(RECORD, 30, end);
    const b = buildDailySeries(RECORD, 30, end);
    expect(a).toEqual(b);
  });

  it('ends on the requested UTC day at the base price', () => {
    const series = buildDailySeries(RECORD, 30, end);
    expect(series).toHaveLength(30);
    expect(series[29].at).toBe('2026-09-26');
    expect(series[29].pricePerTon).toBe(RECORD.basePricePerTon);
  });

  it('walks oldest-first with positive prices and volumes', () => {
    const series = buildDailySeries(RECORD, 10, end);
    expect(series[0].at).toBe('2026-09-17');
    for (const point of series) {
      expect(point.pricePerTon).toBeGreaterThan(0);
      expect(point.volume).toBeGreaterThan(0);
    }
  });
});

describe('aggregateSeries', () => {
  it('returns daily points untouched', () => {
    expect(aggregateSeries(SERIES, 'day')).toEqual(SERIES);
  });

  it('buckets weekly from Monday and accumulates volume', () => {
    const weekly = aggregateSeries(
      [
        { at: '2026-08-30', pricePerTon: 5, volume: 1 }, // Sunday → week of 08-24
        { at: '2026-08-31', pricePerTon: 6, volume: 2 }, // Monday
        { at: '2026-09-01', pricePerTon: 7, volume: 3 },
      ],
      'week'
    );

    expect(weekly).toEqual([
      { at: '2026-08-24', pricePerTon: 5, volume: 1 },
      { at: '2026-08-31', pricePerTon: 7, volume: 5 },
    ]);
  });

  it('buckets monthly by month start', () => {
    const monthly = aggregateSeries(
      [
        { at: '2026-08-31', pricePerTon: 5, volume: 1 },
        { at: '2026-09-01', pricePerTon: 7, volume: 3 },
      ],
      'month'
    );

    expect(monthly).toEqual([
      { at: '2026-08-01', pricePerTon: 5, volume: 1 },
      { at: '2026-09-01', pricePerTon: 7, volume: 3 },
    ]);
  });
});

describe('aggregateCarbonPrices', () => {
  it('quotes every series with the change against the previous close', async () => {
    const snapshot = await aggregateCarbonPrices({}, {
      source: stubSource(),
      now: new Date('2026-09-26T00:00:00Z'),
    });

    expect(snapshot.count).toBe(2);
    const mangroves = snapshot.quotes.find((quote) => quote.assetCode === RECORD.assetCode);
    expect(mangroves?.pricePerTon).toBe(20);
    expect(mangroves?.previousClose).toBe(16);
    expect(mangroves?.change24hAmount).toBe(4);
    expect(mangroves?.change24hPercent).toBe(25);
    expect(mangroves?.currency).toBe('USD');
  });

  it('applies filters and limit', async () => {
    const filtered = await aggregateCarbonPrices(
      { types: ['Renewable Energy'] },
      { source: stubSource() }
    );
    expect(filtered.quotes.map((quote) => quote.assetCode)).toEqual([SECOND_RECORD.assetCode]);

    const limited = await aggregateCarbonPrices({ limit: 1 }, { source: stubSource() });
    expect(limited.count).toBe(1);
    expect(limited.quotes).toHaveLength(1);
  });

  it('rolls up aggregates by type, region and standard', async () => {
    const snapshot = await aggregateCarbonPrices({}, { source: stubSource() });

    expect(snapshot.aggregates.byType.map((bucket) => bucket.key).sort()).toEqual([
      'Mangrove Restoration',
      'Renewable Energy',
    ]);
    expect(snapshot.aggregates.byRegion.map((bucket) => bucket.key).sort()).toEqual([
      'africa',
      'southeast-asia',
    ]);
    expect(snapshot.aggregates.byStandard.map((bucket) => bucket.key).sort()).toEqual([
      'Gold Standard',
      'Plan Vivo',
    ]);
    expect(snapshot.aggregates.totalVolume24h).toBe(30_005);
    expect(snapshot.aggregates.averagePricePerTon).toBe(16.25);
  });

  it('wraps source failures in CarbonPriceError', async () => {
    const failing = stubSource({
      async listQuotes() {
        throw new Error('feed down');
      },
    });

    await expect(aggregateCarbonPrices({}, { source: failing })).rejects.toBeInstanceOf(
      CarbonPriceError
    );
  });
});

describe('getCarbonPriceHistory', () => {
  it('returns null for an unlisted asset', async () => {
    const history = await getCarbonPriceHistory(
      { assetCode: 'NOPE', interval: 'day' },
      { source: stubSource() }
    );
    expect(history).toBeNull();
  });

  it('windows the series and computes stats', async () => {
    const history = await getCarbonPriceHistory(
      {
        assetCode: RECORD.assetCode,
        interval: 'day',
        from: '2026-09-01',
        to: '2026-09-05',
      },
      { source: stubSource() }
    );

    expect(history).not.toBeNull();
    if (!history) return;
    expect(history.assetCode).toBe(RECORD.assetCode);
    expect(history.currency).toBe('USD');
    expect(history.points).toHaveLength(5);
    expect(history.stats).toEqual({
      points: 5,
      firstPrice: 10,
      lastPrice: 20,
      minPrice: 10,
      maxPrice: 20,
      averagePrice: 14.4,
      changePercent: 100,
      totalVolume: 15,
    });
  });

  it('aggregates the window into weekly buckets on request', async () => {
    const history = await getCarbonPriceHistory(
      {
        assetCode: RECORD.assetCode,
        interval: 'week',
        from: '2026-08-30',
        to: '2026-09-05',
      },
      { source: stubSource() }
    );

    expect(history?.interval).toBe('week');
    expect(history?.points).toHaveLength(1);
    expect(history?.points[0].volume).toBe(15);
  });

  it('defaults to the last 90 days when unbounded', async () => {
    const history = await getCarbonPriceHistory(
      { assetCode: RECORD.assetCode, interval: 'day' },
      { source: createCatalogPriceSource([RECORD]), now: new Date('2026-09-26T00:00:00Z') }
    );

    expect(history).not.toBeNull();
    if (!history) return;
    expect(history.to).toBe('2026-09-26');
    expect(history.from).toBe('2026-06-29');
    expect(history.points).toHaveLength(90);
  });
});

describe('createCatalogPriceSource', () => {
  it('serves the catalog it was given', async () => {
    const source = createCatalogPriceSource([RECORD]);
    const quotes = await source.listQuotes();

    expect(quotes).toEqual([RECORD]);
    expect(quotes[0]).not.toBe(RECORD); // defensive copy
    expect(await source.getDailySeries('MISSING', 10)).toBeNull();
  });

  it('memoises generated series per asset', async () => {
    const now = vi.fn(() => new Date('2026-09-26T00:00:00Z'));
    const source = createCatalogPriceSource([RECORD], { now });

    await source.getDailySeries(RECORD.assetCode, 10);
    await source.getDailySeries(RECORD.assetCode, 10);

    expect(now).toHaveBeenCalledTimes(1);
  });
});
