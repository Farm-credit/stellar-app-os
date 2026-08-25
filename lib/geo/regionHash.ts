import { createHmac } from 'crypto';
import type { GpsCoordinates } from '@/lib/types/location';

/**
 * Grid resolution in decimal degrees.
 * 0.5° ≈ 55 km at the equator — coarse enough to prevent GPS reconstruction.
 */
const GRID_DEG = 0.5;

/**
 * Snap a coordinate to the nearest grid cell origin (floor to grid).
 */
function snapToGrid(value: number): number {
  return Math.floor(value / GRID_DEG) * GRID_DEG;
}

/**
 * Derive the public center-point of the grid cell containing coords.
 * This is the only lat/lng exposed to the frontend.
 */
export function regionCenter(coords: GpsCoordinates): GpsCoordinates {
  return {
    lat: snapToGrid(coords.lat) + GRID_DEG / 2,
    lon: snapToGrid(coords.lon) + GRID_DEG / 2,
  };
}

/**
 * Produce a stable, opaque identifier for the grid cell.
 *
 * HMAC-SHA256(secret, "lat:<snapped_lat>,lon:<snapped_lon>") prevents
 * enumeration: without the secret an attacker cannot map hash → cell.
 */
export function hashRegionKey(coords: GpsCoordinates): string {
  const secret = process.env.REGION_HASH_SECRET ?? 'dev-secret-replace-in-prod';
  const snappedLat = snapToGrid(coords.lat).toFixed(1);
  const snappedLon = snapToGrid(coords.lon).toFixed(1);
  const message = `lat:${snappedLat},lon:${snappedLon}`;
  return createHmac('sha256', secret).update(message).digest('hex');
}

export interface RegionHashResult {
  /** Opaque HMAC key stored in the DB — never exposed directly */
  regionKey: string;
  /** Public center of the grid cell, safe to expose on the map */
  centerLat: number;
  centerLon: number;
}

/**
 * One-call helper used at upload time:
 * returns both the opaque key (for storage) and the public cell center.
 */
export function buildRegionHash(coords: GpsCoordinates): RegionHashResult {
  const center = regionCenter(coords);
  return {
    regionKey: hashRegionKey(coords),
    centerLat: center.lat,
    centerLon: center.lon,
  };
}
