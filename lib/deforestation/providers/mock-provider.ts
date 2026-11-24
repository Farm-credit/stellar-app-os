/**
 * Mock deforestation alert feed — Issue #672
 *
 * A deterministic, GFW-shaped fallback used when `GFW_API_KEY` is not
 * configured (or when the live GFW API fails). It emits integrated-alert
 * style rows (date, confidence, point, area) inside each monitored zone so
 * the whole pipeline — pull, dedupe, notify, map highlight — behaves exactly
 * as it does with the real provider.
 */

import {
  affectedAreaPolygonFor,
  centroid,
  pointInPolygon,
  type Point,
  type Ring,
} from '../geometry';
import type {
  AlertConfidence,
  DeforestationProvider,
  MonitoredZone,
  ProviderAlert,
} from '../types';

/** Alerts are generated for detections within this window. */
const DEFAULT_LOOKBACK_DAYS = 14;

/** At most this many alerts are returned per zone per pull. */
const MAX_ALERTS_PER_ZONE = 4;

const CONFIDENCES: AlertConfidence[] = ['high', 'nominal', 'nominal', 'low'];

/** Deterministic 0..1 hash so a given zone/day always yields the same alert. */
function hash01(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Deterministic detection point for a zone on a given day: a small offset
 * from the zone centroid that is always inside the zone polygon.
 */
function detectionPointFor(zone: MonitoredZone, dayKey: string): Point {
  const box = zone.polygon.reduce(
    (acc, [lng, lat]) => ({
      west: Math.min(acc.west, lng),
      east: Math.max(acc.east, lng),
      south: Math.min(acc.south, lat),
      north: Math.max(acc.north, lat),
    }),
    { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity }
  );

  const spreadLng = (box.east - box.west) * 0.25;
  const spreadLat = (box.north - box.south) * 0.25;
  const [lng, lat] = centroid(zone.polygon);

  for (let attempt = 0; attempt < 8; attempt++) {
    const dx = (hash01(`${zone.zoneId}:${dayKey}:x:${attempt}`) - 0.5) * 2 * spreadLng;
    const dy = (hash01(`${zone.zoneId}:${dayKey}:y:${attempt}`) - 0.5) * 2 * spreadLat;
    const point: Point = [lng + dx, lat + dy];
    if (pointInPolygon(point, zone.polygon)) return point;
  }
  return [lng, lat];
}

export interface MockProviderOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** How far back detections are generated. */
  lookbackDays?: number;
}

export function createMockDeforestationProvider(
  options: MockProviderOptions = {}
): DeforestationProvider {
  const now = options.now ?? (() => new Date());
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  return {
    name: 'mock',
    fetchAlerts(zone: MonitoredZone, since: Date): Promise<ProviderAlert[]> {
      const alerts: ProviderAlert[] = [];
      const today = now();

      for (let dayOffset = 0; dayOffset < lookbackDays; dayOffset++) {
        const day = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
        const detectedOn = toUtcDateString(day);
        if (day.getTime() < since.getTime()) break;

        // Older detections have a ~35% duty cycle; today's detection always
        // exists so every monitored zone always yields at least one alert.
        if (dayOffset > 0 && hash01(`${zone.zoneId}:${detectedOn}:present`) > 0.35) continue;

        const confidence =
          CONFIDENCES[Math.floor(hash01(`${zone.zoneId}:${detectedOn}:conf`) * CONFIDENCES.length)];
        const areaHectares =
          Math.round(
            (0.4 + hash01(`${zone.zoneId}:${detectedOn}:area`) * (zone.areaHectares * 0.004)) * 10
          ) / 10;
        const coordinates = detectionPointFor(zone, detectedOn);

        alerts.push({
          id: `mock-${zone.zoneId}-${detectedOn}`,
          detectedOn,
          confidence,
          areaHectares,
          coordinates,
          sourceUrl: `https://www.globalforestwatch.org/map/?mapMode=monitor&map=forestChange&mlayer=loss&pickGfwAlerts=${coordinates[1]},${coordinates[0]}`,
        });

        if (alerts.length >= MAX_ALERTS_PER_ZONE) break;
      }

      return Promise.resolve(alerts);
    },
  };
}

/** Re-exported for tests that need the affected-area polygon of a mock row. */
export function mockAffectedAreaPolygon(alert: ProviderAlert): Ring {
  return affectedAreaPolygonFor(alert.coordinates, alert.areaHectares, alert.confidence);
}
