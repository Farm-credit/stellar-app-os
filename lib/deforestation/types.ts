/**
 * Deforestation alert domain types — Issue #672
 *
 * Real-time deforestation alerting for monitored forest zones. Alerts are
 * pulled from an external provider (Global Forest Watch when configured,
 * otherwise a deterministic GFW-style mock feed) and stored per project so
 * they can be e-mailed to project managers/sponsors, surfaced in the in-app
 * notification centre, and highlighted on the project map.
 */

/** Which upstream service produced an alert. */
export type DeforestationAlertSource = 'gfw' | 'mock';

/** Alert confidence as reported by GFW integrated alerts. */
export type AlertConfidence = 'low' | 'nominal' | 'high';

/** A project zone that is monitored for canopy loss. */
export interface MonitoredZone {
  /** Stable identifier for the zone, e.g. `zone-proj-001`. */
  zoneId: string;
  /** Owning project id (matches `AdminProjectDetail.id`). */
  projectId: string;
  projectName: string;
  /** Protection/buffer zone area in hectares. */
  areaHectares: number;
  /** Zone boundary as a closed GeoJSON-style ring of [lng, lat] pairs. */
  polygon: Array<[number, number]>;
  /** Zone centroid in [lng, lat]. */
  center: [number, number];
}

/** A raw alert returned by a provider, before it is bound to a zone. */
export interface ProviderAlert {
  /** Provider-scoped alert identifier used for deduplication. */
  id: string;
  /** Date the canopy loss was detected, `YYYY-MM-DD`. */
  detectedOn: string;
  confidence: AlertConfidence;
  /** Estimated affected area in hectares (0 when the provider omits it). */
  areaHectares: number;
  /** Detection point in [lng, lat]. */
  coordinates: [number, number];
  /** Optional deep link back to the provider. */
  sourceUrl?: string;
}

/** A stored, project-bound deforestation alert. */
export interface DeforestationAlert {
  /** `${zoneId}:${id}` — globally unique across zones. */
  id: string;
  /** Provider alert id (without the zone prefix). */
  providerAlertId: string;
  zoneId: string;
  projectId: string;
  projectName: string;
  source: DeforestationAlertSource;
  /** Date the canopy loss was detected, `YYYY-MM-DD`. */
  detectedOn: string;
  /** When this platform first recorded the alert, ISO-8601. */
  recordedAt: string;
  confidence: AlertConfidence;
  /** Estimated affected area in hectares. */
  areaHectares: number;
  /** Detection point in [lng, lat]. */
  coordinates: [number, number];
  /**
   * Closed [lng, lat] ring highlighting the affected area on the project map.
   * Derived from the provider's point + estimated area (or its geometry).
   */
  affectedAreaPolygon: Array<[number, number]>;
  /** Whether project managers have been notified yet. */
  notified: boolean;
  sourceUrl?: string;
}

/** Abstraction over an upstream deforestation alert feed. */
export interface DeforestationProvider {
  readonly name: DeforestationAlertSource;
  /**
   * Return alerts detected inside `zone` on or after `since`.
   * Implementations must reject on transport/API failure so callers can fall
   * back to another provider.
   */
  fetchAlerts(zone: MonitoredZone, since: Date): Promise<ProviderAlert[]>;
}

/** Summary returned by a pull run. */
export interface PullSummary {
  provider: DeforestationAlertSource;
  /** Number of monitored zones checked. */
  zonesChecked: number;
  /** Alerts that were not previously stored. */
  newAlertCount: number;
  /** Newly stored alerts (also available individually). */
  newAlerts: DeforestationAlert[];
  /** Number of alert notification emails handed to the mail provider. */
  emailsSent: number;
  /** True when the primary provider failed and the mock feed was used. */
  usedFallback: boolean;
  /** Per-zone/provider errors encountered during the run. */
  errors: string[];
}
