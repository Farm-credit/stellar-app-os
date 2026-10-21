// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Live Tree-Planting Event Streaming Domain Layer (#1708)
 *
 * Feature: Stream live video from scheduled tree-planting events so remote
 * sponsors can watch their tree being planted in real time.
 *
 * Acceptance Criteria:
 * - Live stream embedded on project event page
 * - Sponsors of trees in the batch notified and invited
 * - Stream recording saved and linked to relevant tree profiles
 */

import { enqueueDigestEvent, type DigestEvent } from '@/lib/notifications';

export type PlantingEventStatus = 'scheduled' | 'live' | 'ended';

export interface PlantingEvent {
  id: string;
  projectId: string;
  title: string;
  description: string;
  /** ISO timestamp the stream is scheduled to start. */
  scheduledAt: string;
  /** ISO timestamp the stream ended (recordings only). */
  endedAt?: string;
  status: PlantingEventStatus;
  /** HLS playback URL embedded on the event page while live. */
  streamUrl: string;
  /** VOD URL saved after the broadcast ends. */
  recordingUrl?: string;
  /** Tree batch planted during this event. */
  batchId: string;
  /** Tree profile ids included in the batch. */
  treeIds: string[];
  /** Optional broadcaster thumbnail. */
  thumbnailUrl?: string;
}

/** Sponsor → trees mapping for a planting batch. */
export interface BatchSponsorship {
  batchId: string;
  sponsorId: string;
  sponsorEmail: string;
  sponsorName: string;
  treeIds: string[];
}

export const MOCK_PLANTING_EVENTS: PlantingEvent[] = [
  {
    id: 'evt-proj-001-2026-10',
    projectId: 'proj-001',
    title: 'Amazon Riparian Planting — Sector North',
    description:
      'Live from the field: crews plant 4,000 containerised seedlings along the north riparian corridor.',
    scheduledAt: '2026-10-24T12:00:00Z',
    status: 'live',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    recordingUrl: undefined,
    batchId: 'batch-proj-001-north-42',
    treeIds: ['tree-1001', 'tree-1002', 'tree-1003', 'tree-1004'],
    thumbnailUrl:
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=1200',
  },
  {
    id: 'evt-proj-001-2026-06',
    projectId: 'proj-001',
    title: 'Monsoon Seed Broadcasting Day',
    description: 'The 2026 broadcast season opened with 620 ha of pelleted native seed sown.',
    scheduledAt: '2026-06-14T10:00:00Z',
    endedAt: '2026-06-14T16:40:00Z',
    status: 'ended',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    recordingUrl: 'https://videos.farmcredit.example/recordings/evt-proj-001-2026-06.mp4',
    batchId: 'batch-proj-001-broadcast-17',
    treeIds: ['tree-0900', 'tree-0901', 'tree-0902'],
  },
  {
    id: 'evt-proj-004-2026-11',
    projectId: 'proj-004',
    title: 'Mangrove Propagule Outplanting — Spring Tides',
    description: 'Community crews plant 2,500 propagules on the restored eastern mudflat.',
    scheduledAt: '2026-11-08T07:30:00Z',
    status: 'scheduled',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    batchId: 'batch-proj-004-tide-05',
    treeIds: ['tree-2200', 'tree-2201'],
  },
];

export const MOCK_BATCH_SPONSORSHIPS: BatchSponsorship[] = [
  {
    batchId: 'batch-proj-001-north-42',
    sponsorId: 'sponsor-101',
    sponsorEmail: 'ana@example.com',
    sponsorName: 'Ana Ferreira',
    treeIds: ['tree-1001', 'tree-1002'],
  },
  {
    batchId: 'batch-proj-001-north-42',
    sponsorId: 'sponsor-202',
    sponsorEmail: 'kenji@example.com',
    sponsorName: 'Kenji Mori',
    treeIds: ['tree-1003'],
  },
  {
    batchId: 'batch-proj-001-north-42',
    sponsorId: 'sponsor-303',
    sponsorEmail: 'liam@example.com',
    sponsorName: 'Liam O’Connor',
    treeIds: ['tree-7788'],
  },
  {
    batchId: 'batch-proj-001-broadcast-17',
    sponsorId: 'sponsor-101',
    sponsorEmail: 'ana@example.com',
    sponsorName: 'Ana Ferreira',
    treeIds: ['tree-0900', 'tree-0901'],
  },
  {
    batchId: 'batch-proj-004-tide-05',
    sponsorId: 'sponsor-404',
    sponsorEmail: 'rina@example.com',
    sponsorName: 'Rina Putri',
    treeIds: ['tree-2200', 'tree-2201'],
  },
];

export function getPlantingEventsForProject(projectId: string): PlantingEvent[] {
  return MOCK_PLANTING_EVENTS.filter((event) => event.projectId === projectId).sort((a, b) =>
    b.scheduledAt.localeCompare(a.scheduledAt)
  );
}

/** The event whose stream should be embedded on the project event page. */
export function getFeaturedPlantingEvent(projectId: string): PlantingEvent | undefined {
  const events = getPlantingEventsForProject(projectId);
  return events.find((event) => event.status === 'live') ?? events[0];
}

/**
 * Sponsors invited to an event are exactly those sponsoring a tree in the
 * event's batch (intersection of batch tree ids and sponsorship tree ids).
 */
export function getSponsorsToInvite(
  event: PlantingEvent,
  sponsorships: readonly BatchSponsorship[] = MOCK_BATCH_SPONSORSHIPS
): BatchSponsorship[] {
  const eventTrees = new Set(event.treeIds);
  return sponsorships.filter(
    (sponsorship) =>
      sponsorship.batchId === event.batchId &&
      sponsorship.treeIds.some((treeId) => eventTrees.has(treeId))
  );
}

export interface StreamInvite {
  sponsorId: string;
  email: string;
  subject: string;
  message: string;
  watchUrl: string;
}

export function buildStreamInvite(event: PlantingEvent, sponsor: BatchSponsorship): StreamInvite {
  const watchUrl = `/projects/${event.projectId}#live-events`;
  return {
    sponsorId: sponsor.sponsorId,
    email: sponsor.sponsorEmail,
    subject: `Watch your trees being planted live — ${event.title}`,
    message:
      `You sponsor ${sponsor.treeIds.length} tree${sponsor.treeIds.length === 1 ? '' : 's'} in this planting batch. ` +
      `The stream starts at ${new Date(event.scheduledAt).toUTCString()}. Join us to watch your trees go into the ground in real time.`,
    watchUrl,
  };
}

/**
 * Notifies every invited sponsor via their daily digest queue (#992).
 * Returns the sponsor ids notified.
 */
export function notifySponsorsOfStream(
  event: PlantingEvent,
  now: Date = new Date(),
  sponsorships: readonly BatchSponsorship[] = MOCK_BATCH_SPONSORSHIPS
): string[] {
  const invitees = getSponsorsToInvite(event, sponsorships);
  for (const sponsor of invitees) {
    const invite = buildStreamInvite(event, sponsor);
    const digestEvent: DigestEvent = {
      id: `${event.id}-${sponsor.sponsorId}`,
      sponsorId: sponsor.sponsorId,
      title: `Live planting stream: ${event.title}`,
      description: invite.message,
      occurredAt: now,
      url: invite.watchUrl,
    };
    enqueueDigestEvent(digestEvent);
  }
  return invitees.map((sponsor) => sponsor.sponsorId);
}

export interface TreeRecordingLink {
  treeId: string;
  eventId: string;
  recordingUrl: string;
}

/**
 * After a broadcast ends the recording is linked to every tree profile in the
 * batch. Returns the links to persist, or an empty list while not recorded.
 */
export function linkRecordingToTrees(event: PlantingEvent): TreeRecordingLink[] {
  if (event.status !== 'ended' || !event.recordingUrl) return [];
  return event.treeIds.map((treeId) => ({
    treeId,
    eventId: event.id,
    recordingUrl: event.recordingUrl as string,
  }));
}
