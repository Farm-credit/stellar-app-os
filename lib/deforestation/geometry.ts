/**
 * Small geometry helpers for deforestation alerting — Issue #672.
 *
 * All coordinates are GeoJSON order: [longitude, latitude].
 * Rings are expected to be closed (first point repeated last); helpers are
 * tolerant of unclosed input where practical.
 */

import type { AlertConfidence } from './types';

export type Point = [number, number];
export type Ring = Point[];

export function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [first] = ring;
  const [last] = ring.slice(-1);
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/** Arithmetic centroid of a ring's vertices. */
export function centroid(ring: Ring): Point {
  const closed = closeRing(ring);
  const points = closed.slice(0, -1);
  const n = points.length || 1;
  const lng = points.reduce((acc, [x]) => acc + x, 0) / n;
  const lat = points.reduce((acc, [, y]) => acc + y, 0) / n;
  return [lng, lat];
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundingBox(ring: Ring): BBox {
  const lngs = ring.map(([x]) => x);
  const lats = ring.map(([, y]) => y);
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

export function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(a.east < b.west || b.east < a.west || a.north < b.south || b.north < a.south);
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(point: Point, ring: Ring): boolean {
  const [x, y] = point;
  const closed = closeRing(ring);
  let inside = false;
  for (let i = 0, j = closed.length - 2; i < closed.length - 1; j = i++) {
    const [xi, yi] = closed[i];
    const [xj, yj] = closed[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when `ring` has at least one vertex inside `area`, or fully contains it. */
export function ringIntersectsArea(ring: Ring, area: Ring): boolean {
  const areaBox = boundingBox(area);
  if (!bboxesOverlap(boundingBox(ring), areaBox)) return false;
  if (ring.some((point) => pointInPolygon(point, area))) return true;
  // `ring` entirely inside `area`
  if (area.some((point) => pointInPolygon(point, ring))) return true;
  // Overlapping bounding boxes with no vertex hits (edge crossing) — conservative hit
  return true;
}

/**
 * Axis-aligned rectangle centred on `center` with approximately `areaHectares`
 * of surface, as a closed [lng, lat] ring.
 *
 * Used to turn point-based alert feeds (GFW returns latitude/longitude rows)
 * into a highlightable affected-area polygon. At the equator 1 ha ≈ 100 m × 100 m.
 */
export function rectangleForArea(center: Point, areaHectares: number): Ring {
  const [lng, lat] = center;
  const safeArea = Number.isFinite(areaHectares) && areaHectares > 0 ? areaHectares : 1;
  // 0.0009 deg² ≈ 1 ha near the equator; side length in degrees for a square:
  const side = Math.sqrt(safeArea) * 0.009;
  // Shrink with latitude so the box stays plausible away from the equator.
  const latScale = Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  const halfLng = side / 2 / latScale;
  const halfLat = side / 2;
  return closeRing([
    [lng - halfLng, lat - halfLat],
    [lng + halfLng, lat - halfLat],
    [lng + halfLng, lat + halfLat],
    [lng - halfLng, lat + halfLat],
  ]);
}

/** Confidence → default footprint when the provider reports no area (ha). */
const CONFIDENCE_DEFAULT_AREA_HA: Record<AlertConfidence, number> = {
  low: 1,
  nominal: 2.5,
  high: 5,
};

export function affectedAreaPolygonFor(
  coordinates: Point,
  areaHectares: number,
  confidence: AlertConfidence
): Ring {
  const area = areaHectares > 0 ? areaHectares : CONFIDENCE_DEFAULT_AREA_HA[confidence];
  return rectangleForArea(coordinates, area);
}
