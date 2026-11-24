// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Public Tree-Planting Schedule Calendar (#1659)
 *
 * Acceptance Criteria:
 * - Calendar on each project page
 * - iCal download for planting events
 * - Sponsors reminded when their tree is scheduled for planting
 *
 * Builds on the planting-event data from `treePlantingStreams` (#1708).
 */

import { enqueueDigestEvent } from '@/lib/notifications';
import {
  getPlantingEventsForProject,
  getSponsorsToInvite,
  type BatchSponsorship,
  type PlantingEvent,
} from '@/lib/treePlantingStreams';

/** Sponsors are reminded once the planting is within this many hours. */
export const REMINDER_LEAD_HOURS = 72;

/** Planting events carry only a start time; calendars need an end. */
export const DEFAULT_EVENT_DURATION_HOURS = 4;

const HOUR_MS = 60 * 60 * 1000;

// ─── Public schedule ───────────────────────────────────────

export function isUpcoming(event: PlantingEvent, now: Date = new Date()): boolean {
  if (event.status === 'live') return true;
  return event.status === 'scheduled' && new Date(event.scheduledAt).getTime() >= now.getTime();
}

/** Upcoming (scheduled or live) events for a project, soonest first. */
export function getUpcomingPlantingEvents(
  projectId: string,
  now: Date = new Date()
): PlantingEvent[] {
  return getPlantingEventsForProject(projectId)
    .filter((event) => isUpcoming(event, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

// ─── iCal (RFC 5545) ───────────────────────────────────────

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing with a leading space. */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let limit = 75;
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > limit) {
      parts.push(current);
      current = char;
      limit = 74; // continuation lines start with one space
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildPlantingEventDescription(event: PlantingEvent): string {
  const lines = [event.description, `Batch: ${event.batchId}`];
  if (event.estimatedSpecies?.length) {
    lines.push(`Estimated species: ${event.estimatedSpecies.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Builds an iCalendar document for the given events. UIDs are stable
 * (derived from the event id) so re-importing updates rather than duplicates.
 */
export function buildPlantingCalendarIcs(
  projectId: string,
  events: readonly PlantingEvent[],
  now: Date = new Date()
): string {
  const stamp = formatIcsDate(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FarmCredit//Planting Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`Planting schedule — ${projectId}`)}`,
  ];

  for (const event of events) {
    const start = new Date(event.scheduledAt);
    const end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_HOURS * HOUR_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@farmcredit.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(buildPlantingEventDescription(event))}`,
      `URL:/projects/${event.projectId}#planting-calendar`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ─── Sponsor reminders ─────────────────────────────────────

/** Reminder keys already queued, so a sponsor is never reminded twice. */
const sentReminders = new Set<string>();

export function resetSentReminders(): void {
  sentReminders.clear();
}

export function getReminderKey(event: PlantingEvent, sponsorId: string): string {
  return `reminder-${event.id}-${sponsorId}`;
}

/** Whether the event is inside the reminder window (not past, not too far out). */
export function isWithinReminderWindow(
  event: PlantingEvent,
  now: Date = new Date(),
  leadHours: number = REMINDER_LEAD_HOURS
): boolean {
  if (event.status === 'ended') return false;
  const diff = new Date(event.scheduledAt).getTime() - now.getTime();
  return diff > 0 && diff <= leadHours * HOUR_MS;
}

export interface PlantingReminderResult {
  eventId: string;
  sponsorId: string;
}

/**
 * Queues a reminder (via the daily digest, #992) for every sponsor whose tree
 * is in a batch planted within the reminder window. Safe to call repeatedly
 * from a scheduler: each sponsor/event pair is reminded once.
 */
export function sendPlantingReminders(
  events: readonly PlantingEvent[],
  sponsorships: readonly BatchSponsorship[],
  now: Date = new Date()
): PlantingReminderResult[] {
  const results: PlantingReminderResult[] = [];

  for (const event of events) {
    if (!isWithinReminderWindow(event, now)) continue;

    for (const sponsor of getSponsorsToInvite(event, sponsorships)) {
      const key = getReminderKey(event, sponsor.sponsorId);
      if (sentReminders.has(key)) continue;

      const treeCount = sponsor.treeIds.filter((id) => event.treeIds.includes(id)).length;
      enqueueDigestEvent({
        id: key,
        sponsorId: sponsor.sponsorId,
        title: `Planting reminder: ${event.title}`,
        description:
          `${treeCount} of your tree${treeCount === 1 ? ' is' : 's are'} scheduled for planting ` +
          `on ${new Date(event.scheduledAt).toUTCString()}.`,
        occurredAt: now,
        url: `/projects/${event.projectId}#planting-calendar`,
      });
      sentReminders.add(key);
      results.push({ eventId: event.id, sponsorId: sponsor.sponsorId });
    }
  }

  return results;
}
