/**
 * Alert email recipients — Issue #672
 *
 * Project managers come from environment configuration; sponsors of the
 * affected project are derived from the admin user activity feed (donations,
 * credit purchases and listings that mention the project by name).
 */

import { mockAdminUsers } from '@/lib/api/mock/adminUsers';
import type { MonitoredZone } from './types';

/**
 * Comma-separated manager addresses for deforestation alerts, e.g.
 * `DEFORESTATION_ALERT_EMAILS=pm@greenearth.org,ops@greenearth.org`.
 * Falls back to the platform-wide admin alert address.
 */
export function getManagerAlertEmails(): string[] {
  const raw = process.env.DEFORESTATION_ALERT_EMAILS ?? process.env.ADMIN_ALERT_EMAIL ?? '';
  return raw
    .split(',')
    .map((email) => email.trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

/**
 * Sponsors of a project: active users whose recorded activity mentions the
 * project (donations, credit purchases, listings).
 */
export function getSponsorEmailsForProject(projectName: string): string[] {
  const needle = projectName.trim().toLowerCase();
  if (!needle) return [];

  const emails = new Set<string>();
  for (const user of mockAdminUsers) {
    if (user.status !== 'Active') continue;
    const mentionsProject = user.activityLog.some((entry) =>
      entry.description.toLowerCase().includes(needle)
    );
    if (mentionsProject) emails.add(user.email);
  }
  return [...emails];
}

/** Everyone who should hear about a new alert for a zone. */
export function resolveAlertRecipients(zone: Pick<MonitoredZone, 'projectName'>): string[] {
  return [
    ...new Set([...getManagerAlertEmails(), ...getSponsorEmailsForProject(zone.projectName)]),
  ];
}
