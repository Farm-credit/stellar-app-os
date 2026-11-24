import { describe, expect, it } from 'vitest';
import { computeHealthScore, getHealthStatus } from '../health-score';
import { addHealthObservation, getTreeHealthSummary } from '../store';

describe('computeHealthScore', () => {
  it('computes a healthy score for optimal watering, no pests, and strong growth', () => {
    const result = computeHealthScore(
      { heightCm: 140, pestPresence: 'none', wateringStatus: 'optimal' },
      130
    );

    expect(result.score).toBe(100);
    expect(result.status).toBe('healthy');
    expect(result.breakdown).toEqual({
      wateringScore: 100,
      pestScore: 100,
      growthScore: 100,
    });
  });

  it('computes a critical score for severe pests and critical drought', () => {
    const result = computeHealthScore(
      { heightCm: 80, pestPresence: 'severe', wateringStatus: 'critical' },
      85
    );

    expect(result.score).toBeLessThan(40);
    expect(result.status).toBe('critical');
  });

  it('maps score thresholds to expected health statuses', () => {
    expect(getHealthStatus(85)).toBe('healthy');
    expect(getHealthStatus(65)).toBe('fair');
    expect(getHealthStatus(45)).toBe('at_risk');
    expect(getHealthStatus(20)).toBe('critical');
  });
});

describe('tree health store sync', () => {
  it('syncs a newly logged field observation into the sponsor tree health summary', () => {
    const treeId = 'tree-test-sync';
    const before = getTreeHealthSummary(treeId);
    const initialCount = before.observations.length;

    const { observation, summary } = addHealthObservation({
      treeId,
      heightCm: 185,
      pestPresence: 'none',
      wateringStatus: 'optimal',
      soilMoisturePercent: 42,
      observerName: 'Test Field Officer',
      notes: 'Strong new growth',
    });

    expect(observation.syncedToSponsor).toBe(true);
    expect(observation.soilMoisturePercent).toBe(42);
    expect(summary.observations.length).toBe(initialCount + 1);
    expect(summary.latestObservation?.id).toBe(observation.id);
    expect(summary.currentScore).toBe(observation.healthScore);
  });
});
