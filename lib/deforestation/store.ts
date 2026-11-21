/**
 * In-memory deforestation alert store — Issue #672
 *
 * Follows the census-service pattern (lib/census/service.ts): a process-local
 * store keyed by globally unique alert id so repeated pulls never duplicate or
 * re-notify the same detection.
 */

import type { DeforestationAlert } from './types';

/** Keep at most this many alerts per zone so memory stays bounded. */
const MAX_ALERTS_PER_ZONE = 50;

/** zoneId → alerts (newest first). Kept per-zone for the size cap. */
const alertsByZone = new Map<string, DeforestationAlert[]>();

export interface UpsertResult {
  alert: DeforestationAlert;
  created: boolean;
}

/** Insert an alert if its id is new. Returns whether it was created. */
export function upsertAlert(alert: DeforestationAlert): UpsertResult {
  const zoneAlerts = alertsByZone.get(alert.zoneId) ?? [];
  const existing = zoneAlerts.find((a) => a.id === alert.id);
  if (existing) return { alert: existing, created: false };

  zoneAlerts.unshift(alert);
  if (zoneAlerts.length > MAX_ALERTS_PER_ZONE) {
    zoneAlerts.length = MAX_ALERTS_PER_ZONE;
  }
  alertsByZone.set(alert.zoneId, zoneAlerts);
  return { alert, created: true };
}

export function hasAlert(alertId: string): boolean {
  for (const zoneAlerts of alertsByZone.values()) {
    if (zoneAlerts.some((a) => a.id === alertId)) return true;
  }
  return false;
}

export function getAlert(alertId: string): DeforestationAlert | null {
  for (const zoneAlerts of alertsByZone.values()) {
    const found = zoneAlerts.find((a) => a.id === alertId);
    if (found) return found;
  }
  return null;
}

/** All stored alerts, newest detection first. */
export function listAlerts(filter: { projectId?: string } = {}): DeforestationAlert[] {
  const all = [...alertsByZone.values()].flat();
  const filtered = filter.projectId
    ? all.filter((alert) => alert.projectId === filter.projectId)
    : all;
  return filtered.sort((a, b) =>
    a.detectedOn === b.detectedOn
      ? b.recordedAt.localeCompare(a.recordedAt)
      : b.detectedOn.localeCompare(a.detectedOn)
  );
}

/** Mark an alert as seen by project managers. Returns null when unknown. */
export function markAlertNotified(alertId: string): DeforestationAlert | null {
  const alert = getAlert(alertId);
  if (!alert) return null;
  alert.notified = true;
  return alert;
}

export function alertCount(): number {
  return [...alertsByZone.values()].reduce((total, zoneAlerts) => total + zoneAlerts.length, 0);
}

/** Test helper — clears all stored alerts. */
export function resetDeforestationStore(): void {
  alertsByZone.clear();
}
