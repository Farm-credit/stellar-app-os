/**
 * Calculates the great-circle distance between two points on a sphere
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance between point 1 and point 2 in meters
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRadian = (angle: number) => (angle * Math.PI) / 180;

  // Normalize longitudes to handle date line crossing
  let normalizedLon1 = lon1;
  let normalizedLon2 = lon2;
  while (normalizedLon1 > 180) normalizedLon1 -= 360;
  while (normalizedLon1 < -180) normalizedLon1 += 360;
  while (normalizedLon2 > 180) normalizedLon2 -= 360;
  while (normalizedLon2 < -180) normalizedLon2 += 360;

  const dLat = toRadian(lat2 - lat1);
  let dLon = toRadian(normalizedLon2 - normalizedLon1);

  // Ensure we take the shortest path across the date line
  if (dLon > Math.PI) dLon -= 2 * Math.PI;
  if (dLon < -Math.PI) dLon += 2 * Math.PI;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadian(lat1)) * Math.cos(toRadian(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
