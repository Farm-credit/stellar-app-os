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
