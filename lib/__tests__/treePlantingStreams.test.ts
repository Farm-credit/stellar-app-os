import { describe, expect, it } from 'vitest';

import {
  MOCK_BATCH_SPONSORSHIPS,
  MOCK_PLANTING_EVENTS,
  buildStreamInvite,
  getFeaturedPlantingEvent,
  getPlantingEventsForProject,
  getSponsorsToInvite,
  linkRecordingToTrees,
  notifySponsorsOfStream,
} from '../treePlantingStreams';
import { clearDigestEvents, getPendingDigestEvents } from '../notifications';

describe('project event lookup', () => {
  it('lists project events newest-first', () => {
    const events = getPlantingEventsForProject('proj-001');
    expect(events).toHaveLength(3);
    expect(events[0].id).toBe('evt-proj-001-2026-11');
  });

  it('features the live stream first for the event page embed', () => {
    const featured = getFeaturedPlantingEvent('proj-001');
    expect(featured?.status).toBe('live');
    expect(featured?.streamUrl).toMatch(/^https:\/\//);
  });

  it('returns undefined for projects without events', () => {
    expect(getFeaturedPlantingEvent('proj-999')).toBeUndefined();
  });
});

describe('sponsor invites', () => {
  const live = MOCK_PLANTING_EVENTS.find((e) => e.status === 'live')!;

  it('invites only sponsors of trees inside the event batch', () => {
    const invitees = getSponsorsToInvite(live);
    expect(invitees.map((i) => i.sponsorId).sort()).toEqual(['sponsor-101', 'sponsor-202']);
  });

  it('builds an invite pointing at the event page with tree counts', () => {
    const sponsor = MOCK_BATCH_SPONSORSHIPS[0];
    const invite = buildStreamInvite(live, sponsor);
    expect(invite.subject).toContain('live');
    expect(invite.watchUrl).toContain('#live-events');
    expect(invite.message).toContain('2 trees');
  });

  it('notifies invited sponsors through the daily digest queue', () => {
    const now = new Date('2026-10-19T08:00:00Z');
    clearDigestEvents('sponsor-101');
    clearDigestEvents('sponsor-202');

    const notified = notifySponsorsOfStream(live, now);
    expect(notified.sort()).toEqual(['sponsor-101', 'sponsor-202']);
    expect(getPendingDigestEvents('sponsor-101')).toHaveLength(1);
    expect(getPendingDigestEvents('sponsor-202')[0].title).toContain('Live planting stream');

    clearDigestEvents('sponsor-101');
    clearDigestEvents('sponsor-202');
  });
});

describe('recordings', () => {
  it('links the saved recording to every tree profile in the batch', () => {
    const ended = MOCK_PLANTING_EVENTS.find((e) => e.status === 'ended')!;
    const links = linkRecordingToTrees(ended);
    expect(links).toHaveLength(ended.treeIds.length);
    for (const link of links) {
      expect(link.recordingUrl).toMatch(/^https:\/\//);
      expect(ended.treeIds).toContain(link.treeId);
    }
  });

  it('has no recording links while a stream is live or scheduled', () => {
    const live = MOCK_PLANTING_EVENTS.find((e) => e.status === 'live')!;
    const scheduled = MOCK_PLANTING_EVENTS.find((e) => e.status === 'scheduled')!;
    expect(linkRecordingToTrees(live)).toEqual([]);
    expect(linkRecordingToTrees(scheduled)).toEqual([]);
  });
});
