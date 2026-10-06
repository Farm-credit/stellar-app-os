import { describe, expect, it, vi } from 'vitest';
import { getTreeAnalytics, parseTreeAnalyticsFilters } from '../tree-survival';

describe('tree survival analytics', () => {
  it('parses ISO date filters and dimensions', () => {
    const filters = parseTreeAnalyticsFilters(
      new URLSearchParams({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
        species: 'Teak',
        region: 'Ashanti',
        planterTeam: 'Green Team',
      })
    );
    expect(filters.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(filters.planterTeam).toBe('Green Team');
  });

  it('rejects an inverted date range', () => {
    expect(() =>
      parseTreeAnalyticsFilters(
        new URLSearchParams({
          from: '2026-02-01',
          to: '2026-01-01',
        })
      )
    ).toThrow('from must be before or equal to to');
  });

  it('maps aggregate rows into all three dashboard dimensions', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          species: 'Teak',
          region: 'Ashanti',
          planter_team: 'Green Team',
          tree_count: '10',
          planted_count: '10',
          verified_count: '8',
          grown_count: '6',
          died_count: '2',
          total_cost_xlm: '125.5',
          sponsor_count: '5',
          retained_sponsor_count: '3',
        },
      ],
    });
    const report = await getTreeAnalytics({ query } as never);
    expect(report.dimensions.species[0]).toMatchObject({
      value: 'Teak',
      treeCount: 10,
      survivalRatePct: 80,
      costPerTreeXlm: 12.55,
      sponsorRetentionRatePct: 60,
    });
    expect(report.dimensions.region[0].value).toBe('Ashanti');
    expect(report.dimensions.planter_team[0].value).toBe('Green Team');
    expect(query).toHaveBeenCalledOnce();
  });
});
