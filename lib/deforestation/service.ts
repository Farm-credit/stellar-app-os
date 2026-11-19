/**
 * Deforestation alert service — Issue #672
 *
 * Pulls canopy-loss alerts for every monitored zone from the configured
 * provider (GFW when keyed, deterministic mock feed otherwise, falling back to
 * the mock feed if the live API fails), stores new detections exactly once,
 * and notifies project managers/sponsors by email the first time an alert is
 * recorded. The in-app notification centre picks alerts up through
 * `GET /api/deforestation/alerts`.
 */

import { sendDeforestationAlertEmail } from '@/lib/email/sendgrid';
import { affectedAreaPolygonFor } from './geometry';
import { resolveAlertRecipients } from './recipients';
import { isGfwConfigured } from './providers/gfw-client';
import { getDeforestationProvider, getFallbackProvider } from './provider';
import {
  alertCount,
  listAlerts,
  markAlertNotified,
  upsertAlert,
  resetDeforestationStore,
} from './store';
import type {
  DeforestationAlert,
  DeforestationProvider,
  MonitoredZone,
  ProviderAlert,
  PullSummary,
} from './types';
import { getMonitoredZones } from './zones';

/** Default lookback window for a pull run. */
const DEFAULT_LOOKBACK_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PullOptions {
  /** Inject a provider (tests / forced mock runs). */
  provider?: DeforestationProvider;
  /** Inject the zone set (defaults to all monitored buffer zones). */
  zones?: MonitoredZone[];
  /** How far back to query; defaults to 30 days before `now`. */
  since?: Date;
  /** Send notification emails for newly recorded alerts (default true). */
  notify?: boolean;
  /** Injectable clock (tests). */
  now?: Date;
}

function buildAlert(
  zone: MonitoredZone,
  providerAlert: ProviderAlert,
  source: DeforestationAlert['source'],
  recordedAt: string
): DeforestationAlert {
  return {
    id: `${zone.zoneId}:${providerAlert.id}`,
    providerAlertId: providerAlert.id,
    zoneId: zone.zoneId,
    projectId: zone.projectId,
    projectName: zone.projectName,
    source,
    detectedOn: providerAlert.detectedOn,
    recordedAt,
    confidence: providerAlert.confidence,
    areaHectares: providerAlert.areaHectares,
    coordinates: providerAlert.coordinates,
    affectedAreaPolygon: affectedAreaPolygonFor(
      providerAlert.coordinates,
      providerAlert.areaHectares,
      providerAlert.confidence
    ),
    notified: false,
    sourceUrl: providerAlert.sourceUrl,
  };
}

/**
 * Pull alerts for all monitored zones. New alerts are stored once and their
 * recipients emailed once; repeat runs are deduplicated by alert id.
 */
export async function pullDeforestationAlerts(options: PullOptions = {}): Promise<PullSummary> {
  const zones = options.zones ?? getMonitoredZones();
  const shouldNotify = options.notify ?? true;
  const now = options.now ?? new Date();
  const since = options.since ?? new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY);

  let provider = options.provider ?? getDeforestationProvider();
  let usedFallback = false;
  const errors: string[] = [];
  const newAlerts: DeforestationAlert[] = [];
  let emailsSent = 0;

  for (const zone of zones) {
    let rows: ProviderAlert[];
    try {
      rows = await provider.fetchAlerts(zone, since);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name} @ ${zone.zoneId}: ${message}`);

      // Live provider failed — retry this zone with the mock feed.
      if (!usedFallback && !options.provider) {
        usedFallback = true;
        provider = getFallbackProvider(() => now);
        try {
          rows = await provider.fetchAlerts(zone, since);
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          errors.push(`mock @ ${zone.zoneId}: ${fallbackMessage}`);
          continue;
        }
      } else {
        continue;
      }
    }

    for (const row of rows) {
      const alert = buildAlert(zone, row, provider.name, now.toISOString());
      const { alert: stored, created } = upsertAlert(alert);
      if (!created) continue;

      newAlerts.push(stored);

      if (!shouldNotify) continue;
      const recipients = resolveAlertRecipients(zone);
      if (recipients.length === 0) continue;

      const sent = await sendDeforestationAlertEmail({
        recipients,
        projectName: zone.projectName,
        projectId: zone.projectId,
        areaHectares: stored.areaHectares,
        detectedOn: stored.detectedOn,
        confidence: stored.confidence,
        source: provider.name === 'gfw' ? 'Global Forest Watch' : 'GFW satellite alert feed (mock)',
        linkUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/projects/${zone.projectId}`,
      });
      emailsSent += sent;
      markAlertNotified(stored.id);
    }
  }

  return {
    provider: provider.name,
    zonesChecked: zones.length,
    newAlertCount: newAlerts.length,
    newAlerts,
    emailsSent,
    usedFallback,
    errors,
  };
}

let seeded = false;

/**
 * Populate the store for reads (project page, alerts API).
 *
 * Only runs when the store is empty and there is no live GFW key — with a real
 * key the store is owned by the pull worker / pull endpoint, so page reads
 * never trigger upstream API traffic.
 */
export async function ensureDeforestationAlertsSeeded(): Promise<void> {
  if (seeded || alertCount() > 0) return;
  if (isGfwConfigured()) {
    seeded = true;
    return;
  }
  seeded = true;
  await pullDeforestationAlerts({ notify: false, provider: getFallbackProvider() });
}

/** Stored alerts for one project, newest detection first. */
export function getProjectAlerts(projectId: string): DeforestationAlert[] {
  return listAlerts({ projectId });
}

/** All stored alerts, newest detection first. */
export function getAllAlerts(): DeforestationAlert[] {
  return listAlerts();
}

/** Test helper — clears the store and the one-time seed guard. */
export function resetDeforestationService(): void {
  resetDeforestationStore();
  seeded = false;
}
