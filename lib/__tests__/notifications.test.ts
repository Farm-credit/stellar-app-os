import { describe, expect, it } from 'vitest';
import {
  buildSponsorAchievementNotification,
  buildTreeMilestoneNotification,
} from '@/lib/notifications';

describe('notification payload builders', () => {
  it('creates a tree milestone push payload with the right actions and summary', () => {
    const payload = buildTreeMilestoneNotification({
      treeId: 'HAR-2048',
      species: 'Moringa',
      milestone: '1-year survival',
      co2OffsetKg: 94,
      location: 'Kisumu, Kenya',
    });

    expect(payload.title).toContain('1-year survival');
    expect(payload.body).toContain('HAR-2048');
    expect(payload.body).toContain('Moringa');
    expect(payload.data?.treeId).toBe('HAR-2048');
    expect(payload.data?.milestone).toBe('1-year survival');
    expect(payload.actions?.map((action) => action.action)).toEqual(['view', 'close']);
  });

  it('creates a sponsor achievement payload for unlocked milestones', () => {
    const payload = buildSponsorAchievementNotification({
      sponsorName: 'Amina',
      badge: 'Forest Guardian',
      totalTrees: 120,
      totalCo2Kg: 2480,
    });

    expect(payload.title).toContain('Forest Guardian');
    expect(payload.body).toContain('Amina');
    expect(payload.body).toContain('120');
    expect(payload.data?.badge).toBe('Forest Guardian');
  });
});
