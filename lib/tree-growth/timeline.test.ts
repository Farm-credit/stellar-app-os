import { describe, expect, it } from 'vitest';
import { buildTreeGrowthTimeline } from './timeline';
import type { Tree } from '@/lib/types/tree';

const plantedTree: Tree = {
  id: 'tree-test',
  treeId: 'HRV-2024-9001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 22,
  projectName: 'Northern Savanna Reforestation',
};

describe('buildTreeGrowthTimeline', () => {
  it('builds a month-by-month photo story for a planted tree', () => {
    const timeline = buildTreeGrowthTimeline(plantedTree);

    expect(timeline.awaitingPlanting).toBe(false);
    expect(timeline.photos.length).toBeGreaterThan(12);
    expect(timeline.photos[0].monthIndex).toBe(0);
    expect(timeline.photos[0].year).toBe(0);
    expect(timeline.photos[0].caption).toMatch(/month 1$/);

    // Photos are oldest first and months increment by one.
    timeline.photos.forEach((photo, index) => {
      expect(photo.monthIndex).toBe(index);
      expect(photo.cumulativeCo2Kg).toBeGreaterThanOrEqual(0);
    });
  });

  it('returns years newest first and derives impact from the latest photo', () => {
    const timeline = buildTreeGrowthTimeline(plantedTree);
    const latest = timeline.photos[timeline.photos.length - 1];

    expect(timeline.years).toEqual([...timeline.years].sort((a, b) => b - a));
    expect(timeline.impact.heightCm).toBe(latest.heightCm);
    expect(timeline.impact.cumulativeCo2Kg).toBe(latest.cumulativeCo2Kg);
    expect(timeline.impact.monthsDocumented).toBe(timeline.photos.length);
    expect(timeline.impact.yearsCovered).toBe(latest.year + 1);
  });

  it('records the planting and verification milestones', () => {
    const timeline = buildTreeGrowthTimeline(plantedTree);

    const types = timeline.milestones.map((milestone) => milestone.type);
    expect(types).toContain('planted');
    expect(types).toContain('first-photo');
    expect(types).toContain('first-anniversary');
    expect(types).toContain('verified');
    expect(timeline.impact.milestonesReached).toBe(timeline.milestones.length);
  });

  it('attaches a milestone to the photo of the month it happened', () => {
    const timeline = buildTreeGrowthTimeline(plantedTree);
    const plantedMilestone = timeline.milestones.find((entry) => entry.type === 'planted');
    const firstAnniversary = timeline.milestones.find(
      (entry) => entry.type === 'first-anniversary'
    );

    expect(timeline.photos[0].milestone?.type).toBe('planted');
    expect(plantedMilestone?.monthIndex).toBe(0);
    expect(firstAnniversary?.monthIndex).toBe(12);
    expect(timeline.photos[12].milestone?.type).toBe('first-anniversary');
  });

  it('returns an awaiting-planting story for an unplanted tree', () => {
    const fundedTree: Tree = { ...plantedTree, status: 'funded', plantedAt: undefined };
    const timeline = buildTreeGrowthTimeline(fundedTree);

    expect(timeline.awaitingPlanting).toBe(true);
    expect(timeline.photos).toEqual([]);
    expect(timeline.years).toEqual([]);
    expect(timeline.plantedAt).toBeNull();
    expect(timeline.milestones).toHaveLength(1);
    expect(timeline.milestones[0].type).toBe('awaiting-planting');
    expect(timeline.impact.monthsDocumented).toBe(0);
  });

  it('ignores an unparseable planting date', () => {
    const broken: Tree = { ...plantedTree, plantedAt: 'not-a-date' };
    expect(buildTreeGrowthTimeline(broken).awaitingPlanting).toBe(true);
  });

  it('is deterministic across calls', () => {
    expect(buildTreeGrowthTimeline(plantedTree)).toEqual(buildTreeGrowthTimeline(plantedTree));
  });
});
