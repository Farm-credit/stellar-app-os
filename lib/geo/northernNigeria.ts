import type { GpsCoordinates } from '@/lib/types/location';

/**
 * Bounding box for Northern Nigeria (fast pre-filter).
 * Covers the 19 northern states (Sokoto → Borno, Kebbi → Adamawa).
 *
 *   Latitude  : 4°N – 14°N
 *   Longitude : 3°E – 15°E
 */
export const NORTHERN_NIGERIA_BBOX = {
  latMin: 4.0,
  latMax: 14.0,
  lonMin: 3.0,
  lonMax: 15.0,
} as const;

/**
 * Simplified polygon of Northern Nigeria's boundary (19 northern states).
 * Vertices are [lon, lat] pairs in decimal degrees, listed clockwise.
 * Derived from publicly available administrative boundary data.
 */
const NORTHERN_NIGERIA_POLYGON: [number, number][] = [
  // West edge (Kebbi / Sokoto)
  [3.35, 11.68],
  [3.2, 12.35],
  [3.6, 13.05],
  [4.1, 13.72],
  // North (Sokoto / Zamfara / Katsina)
  [4.85, 13.87],
  [5.6, 14.0],
  [6.5, 13.95],
  [7.2, 13.8],
  // North-east (Kano / Jigawa / Yobe)
  [8.1, 13.5],
  [9.0, 13.3],
  [10.2, 13.6],
  [11.5, 13.8],
  [12.5, 13.9],
  // East (Borno)
  [13.6, 13.5],
  [14.65, 13.1],
  [14.9, 12.4],
  [14.7, 11.5],
  // South-east (Adamawa / Taraba)
  [13.8, 10.2],
  [13.2, 9.0],
  [12.5, 8.0],
  // South (Benue / Plateau / Nasarawa)
  [11.2, 7.2],
  [10.0, 6.8],
  [9.0, 6.5],
  [8.0, 6.2],
  // South-west (Kwara / Niger)
  [6.8, 5.8],
  [5.5, 5.2],
  [4.5, 5.6],
  [3.8, 6.5],
  [3.5, 7.8],
  [3.35, 9.5],
  [3.35, 11.68], // close polygon
];

/**
 * Ray-casting point-in-polygon test.
 * Returns true if [lon, lat] is inside the polygon.
 */
function pointInPolygon(lon: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Returns true if the given coordinates fall within the Northern Nigeria boundary.
 *
 * Uses a two-stage check:
 *   1. Fast bounding-box pre-filter
 *   2. Ray-casting point-in-polygon against the simplified boundary polygon
 */
export function isInNorthernNigeria(coords: GpsCoordinates): boolean {
  const { lat, lon } = coords;

  // Stage 1: bbox
  if (
    lat < NORTHERN_NIGERIA_BBOX.latMin ||
    lat > NORTHERN_NIGERIA_BBOX.latMax ||
    lon < NORTHERN_NIGERIA_BBOX.lonMin ||
    lon > NORTHERN_NIGERIA_BBOX.lonMax
  ) {
    return false;
  }

  // Stage 2: polygon
  return pointInPolygon(lon, lat, NORTHERN_NIGERIA_POLYGON);
}
