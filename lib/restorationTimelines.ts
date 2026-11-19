// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Forest Restoration Timeline Domain Layer (#1678)
 *
 * Feature: Visual restoration timeline per project showing planned and
 * completed phases (land preparation, nursery, planting, maintenance,
 * monitoring).
 *
 * Acceptance Criteria:
 * - Gantt-style timeline on project page
 * - Completed phases marked in green, upcoming in grey
 * - Phase completion announcements notify subscribed sponsors
 */

import { enqueueDigestEvent, type DigestEvent } from '@/lib/notifications';

export type RestorationPhaseKind =
  'land-preparation' | 'nursery' | 'planting' | 'maintenance' | 'monitoring';

export type RestorationPhaseStatus = 'completed' | 'in-progress' | 'upcoming';

export interface RestorationPhase {
  id: string;
  projectId: string;
  kind: RestorationPhaseKind;
  name: string;
  description: string;
  /** ISO date (YYYY-MM-DD) the phase starts. */
  startDate: string;
  /** ISO date (YYYY-MM-DD) the phase ends. */
  endDate: string;
  /** Field-reported completion, 0–100. */
  progressPercent: number;
}

/** Canonical display order of the five restoration phases. */
export const PHASE_ORDER: readonly RestorationPhaseKind[] = [
  'land-preparation',
  'nursery',
  'planting',
  'maintenance',
  'monitoring',
];

export const PHASE_LABELS: Record<RestorationPhaseKind, string> = {
  'land-preparation': 'Land Preparation',
  nursery: 'Nursery',
  planting: 'Planting',
  maintenance: 'Maintenance',
  monitoring: 'Monitoring',
};

export const mockRestorationPhases: RestorationPhase[] = [
  {
    id: 'phase-proj-001-land',
    projectId: 'proj-001',
    kind: 'land-preparation',
    name: 'Land Preparation',
    description: 'Parcel surveys, access paths and competitive-vegetation clearing.',
    startDate: '2022-03-15',
    endDate: '2022-08-30',
    progressPercent: 100,
  },
  {
    id: 'phase-proj-001-nursery',
    projectId: 'proj-001',
    kind: 'nursery',
    name: 'Community Nursery',
    description: 'Two community nurseries raised 340k native seedlings for outplanting.',
    startDate: '2022-06-01',
    endDate: '2023-05-31',
    progressPercent: 100,
  },
  {
    id: 'phase-proj-001-planting',
    projectId: 'proj-001',
    kind: 'planting',
    name: 'Planting',
    description: 'Monsoon-season broadcast and riparian sapling planting across 1,800 ha.',
    startDate: '2023-01-10',
    endDate: '2026-12-20',
    progressPercent: 78,
  },
  {
    id: 'phase-proj-001-maintenance',
    projectId: 'proj-001',
    kind: 'maintenance',
    name: 'Maintenance',
    description: 'Weeding, replacement planting and browse protection for young stands.',
    startDate: '2024-01-15',
    endDate: '2027-06-30',
    progressPercent: 40,
  },
  {
    id: 'phase-proj-001-monitoring',
    projectId: 'proj-001',
    kind: 'monitoring',
    name: 'Monitoring & MRV',
    description: 'Satellite MRV, biomass plots and third-party verification cycles.',
    startDate: '2027-07-01',
    endDate: '2032-03-15',
    progressPercent: 0,
  },
  {
    id: 'phase-proj-004-land',
    projectId: 'proj-004',
    kind: 'land-preparation',
    name: 'Tidal Hydrology Restoration',
    description: 'Re-opening tidal channels on abandoned aquaculture ponds.',
    startDate: '2023-02-01',
    endDate: '2023-11-30',
    progressPercent: 100,
  },
  {
    id: 'phase-proj-004-nursery',
    projectId: 'proj-004',
    kind: 'nursery',
    name: 'Propagule Nurseries',
    description: 'Coastal community nurseries for mangrove propagules.',
    startDate: '2023-05-01',
    endDate: '2024-04-30',
    progressPercent: 100,
  },
  {
    id: 'phase-proj-004-planting',
    projectId: 'proj-004',
    kind: 'planting',
    name: 'Mangrove Outplanting',
    description: 'Species-zoned propagule planting across 620 ha of restored mudflat.',
    startDate: '2024-01-10',
    endDate: '2026-12-15',
    progressPercent: 55,
  },
  {
    id: 'phase-proj-004-monitoring',
    projectId: 'proj-004',
    kind: 'monitoring',
    name: 'Shoreline Monitoring',
    description: 'Shoreline change detection and crab-return biodiversity counts.',
    startDate: '2027-01-01',
    endDate: '2031-12-31',
    progressPercent: 0,
  },
];

export function getRestorationPhasesForProject(
  projectId: string,
  phases: readonly RestorationPhase[] = mockRestorationPhases
): RestorationPhase[] {
  return phases
    .filter((phase) => phase.projectId === projectId)
    .sort(
      (a, b) =>
        PHASE_ORDER.indexOf(a.kind) - PHASE_ORDER.indexOf(b.kind) ||
        a.startDate.localeCompare(b.startDate)
    );
}

/**
 * Status is derived from field progress, falling back to calendar dates:
 * 100% (or past end date) => completed, 0% before start => upcoming.
 */
export function derivePhaseStatus(
  phase: RestorationPhase,
  now: Date = new Date()
): RestorationPhaseStatus {
  if (phase.progressPercent >= 100) return 'completed';
  const start = new Date(`${phase.startDate}T00:00:00Z`);
  const end = new Date(`${phase.endDate}T23:59:59Z`);
  if (now < start) return 'upcoming';
  if (now > end) return 'completed';
  return 'in-progress';
}

/** Tailwind classes for a Gantt bar per status — completed green, upcoming grey. */
export function phaseStatusClasses(status: RestorationPhaseStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-stellar-green';
    case 'in-progress':
      return 'bg-stellar-blue';
    case 'upcoming':
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

export interface TimelineSpan {
  startMs: number;
  endMs: number;
}

/** Overall date span covering all phases of a project (for Gantt layout). */
export function getTimelineSpan(phases: readonly RestorationPhase[]): TimelineSpan | null {
  if (phases.length === 0) return null;
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const phase of phases) {
    startMs = Math.min(startMs, Date.parse(`${phase.startDate}T00:00:00Z`));
    endMs = Math.max(endMs, Date.parse(`${phase.endDate}T23:59:59Z`));
  }
  return { startMs, endMs };
}

/** Left/width percentages (0–100) of a phase bar within the overall span. */
export function getPhaseBarLayout(
  phase: RestorationPhase,
  span: TimelineSpan
): { leftPercent: number; widthPercent: number } {
  const total = span.endMs - span.startMs;
  if (total <= 0) return { leftPercent: 0, widthPercent: 100 };
  const start = Date.parse(`${phase.startDate}T00:00:00Z`);
  const end = Date.parse(`${phase.endDate}T23:59:59Z`);
  const left = Math.max(0, Math.min(100, ((start - span.startMs) / total) * 100));
  const width = Math.max(2, Math.min(100 - left, ((end - start) / total) * 100));
  return { leftPercent: left, widthPercent: width };
}

export interface PhaseCompletionAnnouncement {
  phaseId: string;
  projectId: string;
  title: string;
  description: string;
  url: string;
}

/** Builds the sponsor-facing announcement for a completed phase. */
export function buildPhaseCompletionAnnouncement(
  phase: RestorationPhase
): PhaseCompletionAnnouncement {
  return {
    phaseId: phase.id,
    projectId: phase.projectId,
    title: `${phase.name} phase completed`,
    description: phase.description,
    url: `/projects/${phase.projectId}#restoration-timeline`,
  };
}

/**
 * Notifies every subscribed sponsor of a phase completion by enqueueing a
 * digest event per sponsor (delivered with their daily digest, #992).
 * Returns the number of sponsors queued.
 */
export function notifySponsorsOfPhaseCompletion(
  phase: RestorationPhase,
  subscriberSponsorIds: readonly string[],
  now: Date = new Date()
): number {
  const announcement = buildPhaseCompletionAnnouncement(phase);
  const unique = [...new Set(subscriberSponsorIds)];
  for (const sponsorId of unique) {
    const event: DigestEvent = {
      id: `${announcement.phaseId}-${sponsorId}`,
      sponsorId,
      title: announcement.title,
      description: announcement.description,
      occurredAt: now,
      url: announcement.url,
    };
    enqueueDigestEvent(event);
  }
  return unique.length;
}
