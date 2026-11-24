import { describe, expect, it } from 'vitest';
import { buildLegacyGroveReport, getLegacyStatus } from './legacy-programme';

describe('legacy programme', () => {
  it('requires at least ten committed years', () => {
    expect(getLegacyStatus('A Sponsor', 9).eligible).toBe(false);
    expect(getLegacyStatus('A Sponsor', 10).groveName).toBe("A Sponsor's Legacy Grove");
  });

  it('builds full annual grove statistics', () => {
    const report = buildLegacyGroveReport(
      'A Sponsor',
      [
        { id: '1', species: 'Teak', region: 'Kano', status: 'verified' } as any,
        { id: '2', species: 'Teak', region: 'Kano', status: 'failed' } as any,
        { id: '3', species: 'Moringa', region: 'Kaduna', status: 'completed' } as any,
      ],
      12,
      'A Sponsor Grove',
      new Date('2026-01-01T00:00:00.000Z')
    );
    expect(report.groveName).toBe('A Sponsor Grove');
    expect(report.stats).toMatchObject({
      totalTrees: 3,
      livingTrees: 2,
      failedTrees: 1,
      survivalRatePct: 66.7,
    });
    expect(report.stats.species).toEqual({ Moringa: 1, Teak: 2 });
  });
});
