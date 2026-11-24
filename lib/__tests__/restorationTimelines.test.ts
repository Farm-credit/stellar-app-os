import { describe, expect, it } from 'vitest';

import {
  PHASE_ORDER,
  buildPhaseCompletionAnnouncement,
  derivePhaseStatus,
  getPhaseBarLayout,
  getRestorationPhasesForProject,
  getTimelineSpan,
  notifySponsorsOfPhaseCompletion,
  phaseStatusClasses,
} from '../restorationTimelines';
import { getPendingDigestEvents, clearDigestEvents } from '../notifications';

const NOW = new Date('2026-02-01T00:00:00Z');

describe('getRestorationPhasesForProject', () => {
  it('returns phases in canonical restoration order', () => {
    const phases = getRestorationPhasesForProject('proj-001');
    expect(phases.map((p) => p.kind)).toEqual([...PHASE_ORDER]);
  });

  it('returns no phases for an unknown project', () => {
    expect(getRestorationPhasesForProject('proj-999')).toEqual([]);
  });
});

describe('derivePhaseStatus', () => {
  it('marks finished work completed (green) and future work upcoming (grey)', () => {
    const phases = getRestorationPhasesForProject('proj-001');
    const land = phases.find((p) => p.kind === 'land-preparation')!;
    const planting = phases.find((p) => p.kind === 'planting')!;
    const monitoring = phases.find((p) => p.kind === 'monitoring')!;

    expect(derivePhaseStatus(land, NOW)).toBe('completed');
    expect(derivePhaseStatus(planting, NOW)).toBe('in-progress');
    expect(derivePhaseStatus(monitoring, NOW)).toBe('upcoming');
  });

  it('uses progress 100 as completed regardless of dates', () => {
    expect(
      derivePhaseStatus(
        {
          id: 'x',
          projectId: 'p',
          kind: 'planting',
          name: 'Planting',
          description: '',
          startDate: '2030-01-01',
          endDate: '2031-01-01',
          progressPercent: 100,
        },
        NOW
      )
    ).toBe('completed');
  });

  it('maps statuses to green/blue/grey classes', () => {
    expect(phaseStatusClasses('completed')).toContain('green');
    expect(phaseStatusClasses('in-progress')).toContain('blue');
    expect(phaseStatusClasses('upcoming')).toContain('gray');
  });
});

describe('Gantt layout', () => {
  it('computes span and bar positions within 0-100%', () => {
    const phases = getRestorationPhasesForProject('proj-001');
    const span = getTimelineSpan(phases);
    expect(span).not.toBeNull();
    for (const phase of phases) {
      const { leftPercent, widthPercent } = getPhaseBarLayout(phase, span!);
      expect(leftPercent).toBeGreaterThanOrEqual(0);
      expect(leftPercent).toBeLessThanOrEqual(100);
      expect(leftPercent + widthPercent).toBeLessThanOrEqual(100.0001);
    }
  });

  it('returns null span for empty projects', () => {
    expect(getTimelineSpan([])).toBeNull();
  });
});

describe('phase completion announcements', () => {
  it('builds an announcement pointing at the project timeline', () => {
    const phase = getRestorationPhasesForProject('proj-001')[0];
    const announcement = buildPhaseCompletionAnnouncement(phase);
    expect(announcement.title).toContain('completed');
    expect(announcement.url).toContain('#restoration-timeline');
  });

  it('notifies each unique subscribed sponsor once via the digest queue', () => {
    const phase = getRestorationPhasesForProject('proj-001').find((p) => p.kind === 'planting')!;
    const sponsorIds = ['sponsor-A', 'sponsor-B', 'sponsor-A'];
    for (const id of sponsorIds) clearDigestEvents(id);

    const queued = notifySponsorsOfPhaseCompletion(phase, sponsorIds, NOW);
    expect(queued).toBe(2);
    expect(getPendingDigestEvents('sponsor-A')).toHaveLength(1);
    expect(getPendingDigestEvents('sponsor-B')).toHaveLength(1);
    expect(getPendingDigestEvents('sponsor-A')[0].title).toContain('completed');

    clearDigestEvents('sponsor-A');
    clearDigestEvents('sponsor-B');
  });
});
