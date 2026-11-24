import { describe, expect, it } from 'vitest';
import {
  continentForRegion,
  evaluateSponsorAchievements,
  type AchievementTreeInput,
} from '../sponsor-achievements';

function trees(count: number, over: Partial<AchievementTreeInput> = {}): AchievementTreeInput[] {
  return Array.from({ length: count }, (_, i) => ({
    species: 'Teak',
    region: 'Kano, Nigeria',
    plantedAt: new Date(Date.UTC(2024, 0, 1 + i)).toISOString(),
    ...over,
  }));
}

const byId = (list: ReturnType<typeof evaluateSponsorAchievements>) =>
  Object.fromEntries(list.map((a) => [a.id, a]));

describe('evaluateSponsorAchievements', () => {
  it('earns nothing with no trees', () => {
    const result = evaluateSponsorAchievements([]);
    expect(result).toHaveLength(5);
    expect(result.every((a) => !a.earned && a.earnedAt === null)).toBe(true);
  });

  it('awards First Tree on the first planting', () => {
    const a = byId(evaluateSponsorAchievements(trees(1)));
    expect(a['first-tree'].earned).toBe(true);
    expect(a['first-tree'].earnedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(a['ten-trees'].earned).toBe(false);
    expect(a['ten-trees'].current).toBe(1);
  });

  it('awards 10 Trees on the 10th planting, not before', () => {
    expect(byId(evaluateSponsorAchievements(trees(9)))['ten-trees'].earned).toBe(false);
    const a = byId(evaluateSponsorAchievements(trees(10)));
    expect(a['ten-trees'].earnedAt).toBe('2024-01-10T00:00:00.000Z');
  });

  it('awards 100 Trees on the 100th planting', () => {
    expect(byId(evaluateSponsorAchievements(trees(99)))['hundred-trees'].earned).toBe(false);
    const a = byId(evaluateSponsorAchievements(trees(100)));
    expect(a['hundred-trees'].earned).toBe(true);
    expect(a['hundred-trees'].current).toBe(100);
  });

  it('awards Multi-Continent Forest when a second continent appears', () => {
    const list = [
      ...trees(2),
      { species: 'Teak', region: 'Pará, Brazil', plantedAt: '2024-06-01T00:00:00.000Z' },
    ];
    const a = byId(evaluateSponsorAchievements(list));
    expect(a['multi-continent-forest'].earned).toBe(true);
    expect(a['multi-continent-forest'].earnedAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('does not award Multi-Continent Forest for one continent or unknown regions', () => {
    const list = [
      ...trees(3),
      { species: 'Teak', region: 'Nairobi, Kenya', plantedAt: '2024-03-01T00:00:00.000Z' },
      { species: 'Teak', region: 'Somewhere, Atlantis', plantedAt: '2024-04-01T00:00:00.000Z' },
    ];
    const a = byId(evaluateSponsorAchievements(list));
    expect(a['multi-continent-forest'].earned).toBe(false);
    expect(a['multi-continent-forest'].current).toBe(1);
  });

  it('awards Rare Species Sponsor on the first rare tree', () => {
    const list = [
      ...trees(2),
      { ...trees(1)[0], species: 'Baobab', plantedAt: '2024-05-05T00:00:00.000Z' },
    ];
    const a = byId(evaluateSponsorAchievements(list));
    expect(a['rare-species-sponsor'].earned).toBe(true);
    expect(a['rare-species-sponsor'].earnedAt).toBe('2024-05-05T00:00:00.000Z');
    expect(byId(evaluateSponsorAchievements(trees(5)))['rare-species-sponsor'].earned).toBe(false);
  });

  it('ignores trees with invalid dates and does not depend on input order', () => {
    const list = [...trees(3), { species: 'Teak', region: 'Kano, Nigeria', plantedAt: 'nope' }];
    expect(byId(evaluateSponsorAchievements(list))['first-tree'].current).toBe(1);
    const shuffled = trees(10).reverse();
    expect(byId(evaluateSponsorAchievements(shuffled))['ten-trees'].earnedAt).toBe(
      '2024-01-10T00:00:00.000Z'
    );
  });
});

describe('continentForRegion', () => {
  it('maps the country part of a region', () => {
    expect(continentForRegion('Kano, Nigeria')).toBe('Africa');
    expect(continentForRegion('Pará, Brazil')).toBe('South America');
    expect(continentForRegion('Nowhere')).toBeNull();
  });
});
