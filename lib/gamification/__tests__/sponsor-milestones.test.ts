import { describe, expect, it } from 'vitest';
import { getSponsorMilestones, isRareTreeSpecies } from '@/lib/gamification/sponsor-milestones';

function trees(count: number, species = 'Teak', start = Date.UTC(2024, 0, 1)) {
  return Array.from({ length: count }, (_, i) => ({
    species,
    plantedAt: new Date(start + i * 86_400_000).toISOString(),
  }));
}

describe('getSponsorMilestones', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('returns nothing for a sponsor without trees', () => {
    expect(getSponsorMilestones([], now)).toEqual([]);
  });

  it('awards the 10th tree milestone only at 10 trees', () => {
    expect(getSponsorMilestones(trees(9), new Date('2024-06-01')).map((m) => m.id)).toEqual([]);
    const ids = getSponsorMilestones(trees(10), new Date('2024-06-01')).map((m) => m.id);
    expect(ids).toEqual(['tenth_tree']);
  });

  it('awards the one-year anniversary after a year', () => {
    expect(getSponsorMilestones(trees(1), new Date('2024-12-31')).length).toBe(0);
    const [m] = getSponsorMilestones(trees(1), new Date('2025-01-02'));
    expect(m.id).toBe('one_year_anniversary');
    expect(m.achievedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('awards first rare species using the earliest rare tree', () => {
    const input = [
      ...trees(2),
      { species: 'Baobab', plantedAt: '2024-03-01T00:00:00Z' },
      { species: 'Iroko', plantedAt: '2024-04-01T00:00:00Z' },
    ];
    const rare = getSponsorMilestones(input, new Date('2024-06-01')).find(
      (m) => m.id === 'first_rare_species'
    );
    expect(rare?.achievedAt).toBe('2024-03-01T00:00:00.000Z');
    expect(rare?.shareText).toContain('Baobab');
  });

  it('sorts newest first and provides share text', () => {
    const result = getSponsorMilestones(trees(12), now);
    expect(result.map((m) => m.id)).toEqual(['one_year_anniversary', 'tenth_tree']);
    expect(result.every((m) => m.shareText.length > 0)).toBe(true);
  });

  it('identifies rare species case-insensitively', () => {
    expect(isRareTreeSpecies('baobab')).toBe(true);
    expect(isRareTreeSpecies('Teak')).toBe(false);
  });
});
