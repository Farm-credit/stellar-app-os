import { beforeEach, describe, expect, it } from 'vitest';
import type { Tree } from '@/lib/types/tree';
import {
  deriveGrowthStage,
  getStageTransitionNotifications,
  getTreeGrowthStageTimeline,
  resetGrowthStageStore,
  sortStagePhotosChronologically,
  uploadGrowthStagePhoto,
} from './stages';

const baseTree: Tree = {
  id: 'tree-test-1',
  treeId: 'FC-TEST-001',
  species: 'Teak',
  region: 'Rift Valley',
  status: 'verified',
  plantedAt: '2025-01-01T00:00:00.000Z',
  lat: -0.28,
  lng: 36.07,
  co2OffsetKgPerYear: 22,
  projectName: 'Rift Valley Reforestation',
  sponsorName: 'Alice Sponsor',
};

describe('tree growth stages', () => {
  beforeEach(() => {
    resetGrowthStageStore();
  });

  describe('deriveGrowthStage', () => {
    it('uses explicit growthStage when provided', () => {
      expect(deriveGrowthStage({ growthStage: 'mature', plantedAt: '2026-01-01' })).toBe('mature');
      expect(deriveGrowthStage({ growthStage: 'juvenile' })).toBe('juvenile');
    });

    it('derives stage from plantedAt age when growthStage is omitted', () => {
      const nowMs = Date.UTC(2026, 6, 1); // 2026-07-01
      expect(deriveGrowthStage({ plantedAt: '2026-01-01T00:00:00.000Z' }, nowMs)).toBe('sapling');
      expect(deriveGrowthStage({ plantedAt: '2023-06-01T00:00:00.000Z' }, nowMs)).toBe('juvenile');
      expect(deriveGrowthStage({ plantedAt: '2020-01-01T00:00:00.000Z' }, nowMs)).toBe('mature');
    });

    it('defaults to sapling when plantedAt is missing or invalid', () => {
      expect(deriveGrowthStage({})).toBe('sapling');
      expect(deriveGrowthStage({ plantedAt: 'not-a-date' })).toBe('sapling');
    });
  });

  describe('chronological photo timeline', () => {
    it('sorts stage photos chronologically (oldest first)', () => {
      const sorted = sortStagePhotosChronologically([
        {
          id: 'p2',
          treeId: 't1',
          stage: 'juvenile',
          imageUrl: 'https://example.com/2.jpg',
          uploadedBy: 'Team B',
          uploadedAt: '2025-06-01T00:00:00.000Z',
        },
        {
          id: 'p1',
          treeId: 't1',
          stage: 'sapling',
          imageUrl: 'https://example.com/1.jpg',
          uploadedBy: 'Team A',
          uploadedAt: '2024-01-15T00:00:00.000Z',
        },
      ]);

      expect(sorted.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('seeds chronological photos up to the tree current stage', () => {
      const matureTree: Tree = { ...baseTree, id: 'tree-mature', growthStage: 'mature' };
      const timeline = getTreeGrowthStageTimeline(matureTree.id, matureTree);

      expect(timeline.currentStage).toBe('mature');
      expect(timeline.photos.map((p) => p.stage)).toEqual(['sapling', 'juvenile', 'mature']);
    });
  });

  describe('stage transition notifications', () => {
    it('notifies sponsor when tree transitions to a new growth stage', () => {
      const saplingTree: Tree = { ...baseTree, growthStage: 'sapling' };
      getTreeGrowthStageTimeline(saplingTree.id, saplingTree);

      const result = uploadGrowthStagePhoto(
        {
          treeId: saplingTree.id,
          stage: 'juvenile',
          imageUrl: 'https://example.com/juvenile.jpg',
          uploadedBy: 'Rift Valley Field Team',
          caption: 'Strong trunk growth observed',
          heightCm: 150,
          uploadedAt: '2026-02-01T10:00:00.000Z',
        },
        saplingTree
      );

      expect(result.transitioned).toBe(true);
      expect(result.previousStage).toBe('sapling');
      expect(result.currentStage).toBe('juvenile');
      expect(result.notification).not.toBeNull();
      expect(result.notification?.sponsorId).toBe('Alice Sponsor');
      expect(result.notification?.newStage).toBe('juvenile');
      expect(result.notification?.title).toContain('Juvenile');

      const notifications = getStageTransitionNotifications(saplingTree.id);
      expect(notifications).toHaveLength(1);
    });

    it('does not emit a transition notification when uploading a photo for the same stage', () => {
      const saplingTree: Tree = { ...baseTree, growthStage: 'sapling' };
      getTreeGrowthStageTimeline(saplingTree.id, saplingTree);

      const result = uploadGrowthStagePhoto(
        {
          treeId: saplingTree.id,
          stage: 'sapling',
          imageUrl: 'https://example.com/sapling-2.jpg',
          uploadedBy: 'Rift Valley Field Team',
        },
        saplingTree
      );

      expect(result.transitioned).toBe(false);
      expect(result.notification).toBeNull();
      expect(getStageTransitionNotifications(saplingTree.id)).toHaveLength(0);
    });
  });
});
