/**
 * Monitored zones — Issue #672
 *
 * A project becomes a "monitored zone" when it carries a forest protection
 * buffer zone (`AdminProjectDetail.bufferZone`, issue #1714). The buffer
 * polygon is the area we watch for canopy loss.
 */

import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { centroid, closeRing, type Ring } from './geometry';
import type { MonitoredZone } from './types';

/** Buffer polygons with fewer than 3 vertices cannot be monitored. */
const MIN_ZONE_VERTICES = 3;

/**
 * A deforestation detection that may fall inside a monitored buffer zone.
 * Coordinates are `[lng, lat]` to match the buffer polygon convention.
 */
export interface DeforestationDetection {
  id: string;
  coordinates: [number, number];
  areaHectares?: number;
  detectedAt?: string;
}

/**
 * An alert raised when a deforestation detection falls inside a monitored
 * forest protection buffer zone.
 */
export interface ZoneDeforestationAlert {
  zoneId: string;
  projectId: string;
  projectName: string;
  detectionId: string;
  coordinates: [number, number];
  areaHectares?: number;
  detectedAt?: string;
}

/**
 * Ray-casting point-in-polygon test. The ring is expected to be closed
 * (first vertex repeated at the end), but open rings are handled too.
 */
function isPointInRing(point: [number, number], ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Compute the area of a polygon ring in hectares using the spherical
 * excess (shoelace on the sphere) approximation. Coordinates are
 * `[lng, lat]` in degrees.
 */
function ringAreaHectares(ring: Ring): number {
  if (ring.length < MIN_ZONE_VERTICES) return 0;

  const EARTH_RADIUS_M = 6_378_137;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];

    total +=
      toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  const areaM2 = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return areaM2 / 10_000;
}

/**
 * Every project with a usable forest protection buffer polygon is monitored
 * for deforestation alerts.
 */
export function getMonitoredZones(): MonitoredZone[] {
  const zones: MonitoredZone[] = [];

  for (const project of mockAdminProjectDetails) {
    const buffer = project.bufferZone;
    const polygon = buffer?.polygonCoordinates;
    if (!polygon || polygon.length < MIN_ZONE_VERTICES) continue;

    const ring: Ring = closeRing(polygon.map(([lng, lat]) => [lng, lat] as [number, number]));

    const storedArea = buffer.areaHectares;
    const areaHectares =
      typeof storedArea === 'number' && Number.isFinite(storedArea) && storedArea > 0
        ? storedArea
        : ringAreaHectares(ring);

    zones.push({
      zoneId: `zone-${project.id}`,
      projectId: project.id,
      projectName: project.name,
      areaHectares,
      polygon: ring,
      center: centroid(ring),
    });
  }

  return zones;
}

export function getMonitoredZoneForProject(projectId: string): MonitoredZone | null {
  return getMonitoredZones().find((zone) => zone.projectId === projectId) ?? null;
}

/**
 * Check deforestation detections against every monitored buffer polygon and
 * return alerts for detections that fall inside a zone.
 */
export function getDeforestationAlertsForZones(
  detections: DeforestationDetection[],
): ZoneDeforestationAlert[] {
  const zones = getMonitoredZones();
  const alerts: ZoneDeforestationAlert[] = [];

  for (const zone of zones) {
    for (const detection of detections) {
      if (!isPointInRing(detection.coordinates, zone.polygon)) continue;

      alerts.push({
        zoneId: zone.zoneId,
        projectId: zone.projectId,
        projectName: zone.projectName,
        detectionId: detection.id,
        coordinates: detection.coordinates,
        areaHectares: detection.areaHectares,
        detectedAt: detection.detectedAt,
      });
    }
  }

  return alerts;
}

/**
 * Check deforestation detections against a single project's buffer polygon.
 */
export function getDeforestationAlertsForProject(
  projectId: string,
  detections: DeforestationDetection[],
): ZoneDeforestationAlert[] {
  const zone = getMonitoredZoneForProject(projectId);
  if (!zone) return [];

  return detections
    .filter((detection) => isPointInRing(detection.coordinates, zone.polygon))
    .map((detection) => ({
      zoneId: zone.zoneId,
      projectId: zone.projectId,
      projectName: zone.projectName,
      detectionId: detection.id,
      coordinates: detection.coordinates,
      areaHectares: detection.areaHectares,
      detectedAt: detection.detectedAt,
    }));
}