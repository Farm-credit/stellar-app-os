import { containsPointInPolygon } from './polygon';

export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  return containsPointInPolygon(point[1], point[0], polygon);
}
