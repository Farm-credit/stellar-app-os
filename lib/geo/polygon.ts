export interface RegionPolygonCheckInput {
  latitude: number;
  longitude: number;
  regionCode: string;
}

const REGION_POLYGONS: Record<string, [number, number][]> = {
  'northern-nigeria': [
    [4.0, 3.0],
    [14.0, 3.0],
    [14.0, 15.0],
    [4.0, 15.0],
  ],
  fiji: [
    [-20.0, 177.0],
    [-15.0, 177.0],
    [-15.0, -178.0],
    [-20.0, -178.0],
  ],
  tonga: [
    [-23.0, -176.0],
    [-15.0, -176.0],
    [-15.0, -173.0],
    [-23.0, -173.0],
  ],
  samoa: [
    [-14.0, -173.0],
    [-13.0, -173.0],
    [-13.0, -171.0],
    [-14.0, -171.0],
  ],
};

/**
 * Normalize longitude to the range [-180, 180].
 * Handles wraparound for locations near the date line.
 */
export function normalizeLng(lng: number): number {
  // Keep normalizing until within range
  let normalized = lng;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Calculate the shortest longitude distance considering wraparound.
 * Returns the signed difference in the range [-180, 180].
 */
export function lngDelta(a: number, b: number): number {
  const diff = a - b;
  // Wrap to [-180, 180]
  if (diff > 180) return diff - 360;
  if (diff < -180) return diff + 360;
  return diff;
}

export function containsPointInPolygon(
  latitude: number,
  longitude: number,
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  // Normalize the input longitude
  const normalizedLng = normalizeLng(longitude);

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[j];

    // Calculate longitude delta considering date line wraparound
    const dLng = lngDelta(lng2, lng1);

    // Ray casting algorithm adapted for date line crossings
    const crosses =
      lat1 > normalizedLng !== lat2 > normalizedLng &&
      latitude < ((lat2 - lat1) * (normalizedLng - lng1)) / dLng + lat1;

    if (crosses) {
      inside = !inside;
    }
  }

  return inside;
}

export function checkRegionCoverage(input: RegionPolygonCheckInput): boolean {
  const { latitude, longitude, regionCode } = input;
  const normalizedRegion = regionCode.trim().toLowerCase();
  const polygon = REGION_POLYGONS[normalizedRegion];

  if (!polygon) {
    return false;
  }

  return containsPointInPolygon(latitude, longitude, polygon);
}

const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_DEGREE_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

/**
 * Approximate the area of a polygon in hectares using an equirectangular
 * projection scaled by the mean latitude of the polygon. Longitudes are
 * unwrapped relative to the first vertex so polygons crossing the date line
 * are measured correctly.
 */
export function computePolygonAreaHectares(polygon: [number, number][]): number {
  if (polygon.length < 3) {
    return 0;
  }

  const baseLng = polygon[0][1];
  const points: [number, number][] = polygon.map(([lat, lng]) => [
    lat,
    baseLng + lngDelta(lng, baseLng),
  ]);

  let sumLat = 0;
  for (const [lat] of points) {
    sumLat += lat;
  }
  const meanLat = sumLat / points.length;
  const metersPerDegreeLng =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos((meanLat * Math.PI) / 180), 0);

  // Shoelace formula in local meter coordinates.
  let doubleArea = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [lat1, lng1] = points[j];
    const [lat2, lng2] = points[i];
    const x1 = lng1 * metersPerDegreeLng;
    const y1 = lat1 * METERS_PER_DEGREE_LAT;
    const x2 = lng2 * metersPerDegreeLng;
    const y2 = lat2 * METERS_PER_DEGREE_LAT;
    doubleArea += x1 * y2 - x2 * y1;
  }

  const areaSquareMeters = Math.abs(doubleArea) / 2;
  return areaSquareMeters / 10000;
}

/**
 * Returns true if the point lies inside any of the provided polygons.
 */
export function pointInAnyPolygon(
  latitude: number,
  longitude: number,
  polygons: [number, number][][]
): boolean {
  for (const polygon of polygons) {
    if (containsPointInPolygon(latitude, longitude, polygon)) {
      return true;
    }
  }
  return false;
}

function segmentIntersects(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const orient = (p: [number, number], q: [number, number], r: [number, number]): number => {
    const value = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : -1;
  };

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  const onSegment = (p: [number, number], q: [number, number], r: [number, number]): boolean =>
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1]);

  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;

  return false;
}

/**
 * Returns true if two polygons overlap (edge intersection, containment,
 * or shared vertices). Longitudes are unwrapped relative to the first
 * polygon's first vertex to remain date-line safe.
 */
export function polygonIntersectsPolygon(a: [number, number][], b: [number, number][]): boolean {
  if (a.length < 3 || b.length < 3) {
    return false;
  }

  const baseLng = a[0][1];
  const unwrap = (polygon: [number, number][]): [number, number][] =>
    polygon.map(([lat, lng]) => [lat, baseLng + lngDelta(lng, baseLng)]);

  const polyA = unwrap(a);
  const polyB = unwrap(b);

  // Any vertex of one polygon inside the other implies overlap.
  if (pointInAnyPolygon(polyA[0][0], polyA[0][1], [polyB])) {
    return true;
  }
  if (pointInAnyPolygon(polyB[0][0], polyB[0][1], [polyA])) {
    return true;
  }

  // Otherwise check for edge intersections.
  for (let i = 0, j = polyA.length - 1; i < polyA.length; j = i++) {
    for (let k = 0, l = polyB.length - 1; k < polyB.length; l = k++) {
      if (segmentIntersects(polyA[j], polyA[i], polyB[l], polyB[k])) {
        return true;
      }
    }
  }

  return false;
}
