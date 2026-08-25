import type { RedisClientType } from 'redis';
import { getRedisClient } from './redis';
import logger from '@/lib/logger';

const MAP_CACHE_TTL_SECONDS = 300;
const MAP_CACHE_KEY_PREFIX = 'map:gps-coordinates';
const MAP_REGIONS_CACHE_KEY = `${MAP_CACHE_KEY_PREFIX}:regions`;
const PLANTING_MAP_CACHE_KEY_PREFIX = `${MAP_CACHE_KEY_PREFIX}:planting`;
const PLANTING_MAP_CACHE_KEY_PATTERN = `${PLANTING_MAP_CACHE_KEY_PREFIX}:*`;

export interface RegionMarker {
  regionKey: string;
  lat: number;
  lng: number;
  treesPlanted: number;
  farmers: number;
}

export interface PlantingMapPoint {
  geohash: string;
  region: string;
  treeCount: number;
  lat: number;
  lon: number;
}

export function getPlantingMapCacheKey(region: string | null): string {
  return `${PLANTING_MAP_CACHE_KEY_PREFIX}:${region ?? 'all'}`;
}

async function getClient(): Promise<RedisClientType | null> {
  try {
    const client = await getRedisClient();
    return client as RedisClientType | null;
  } catch (err) {
    logger.error('[map-cache] Failed to get Redis client', { err });
    return null;
  }
}

export async function getCachedMapData<T>(key: string): Promise<T | null> {
  const client = (await getClient()) as any;
  if (!client) return null;

  try {
    const cached = await client.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (err) {
    logger.error('[map-cache] read failed', { err, key });
    return null;
  }
}

export async function setCachedMapData<T>(key: string, value: T): Promise<void> {
  const client = (await getClient()) as any;
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), { EX: MAP_CACHE_TTL_SECONDS });
  } catch (err) {
    logger.error('[map-cache] write failed', { err, key });
  }
}

export async function invalidateMapCoordinateCache(): Promise<void> {
  const client = (await getClient()) as any;
  if (!client) return;

  try {
    const plantingMapKeys = await client.keys(PLANTING_MAP_CACHE_KEY_PATTERN);
    await Promise.all([
      client.del(MAP_REGIONS_CACHE_KEY),
      plantingMapKeys.length > 0 ? client.del(plantingMapKeys) : Promise.resolve(0),
    ]);
  } catch (err) {
    logger.error('[map-cache] invalidation failed', { err });
  }
}

export { MAP_CACHE_TTL_SECONDS, MAP_REGIONS_CACHE_KEY };
