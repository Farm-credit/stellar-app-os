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
};

export function containsPointInPolygon(
  latitude: number,
  longitude: number,
  polygon: [number, number][]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[j];

    const onSegment =
      ((y1 > longitude) !== (y2 > longitude)) &&
      latitude < ((x2 - x1) * (longitude - y1)) / (y2 - y1) + x1;

    if (onSegment) {
      inside = !inside;
      continue;
    }

    const crosses =
      (y1 > longitude) !== (y2 > longitude) &&
      latitude < ((x2 - x1) * (longitude - y1)) / (y2 - y1) + x1;

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
