import { createClient, type RedisClientType } from 'redis';

const MAP_CACHE_TTL_SECONDS = 300;
const MAP_CACHE_KEY_PREFIX = 'map:gps-coordinates';
const MAP_REGIONS_CACHE_KEY = `${MAP_CACHE_KEY_PREFIX}:regions`;
const PLANTING_MAP_CACHE_KEY_PREFIX = `${MAP_CACHE_KEY_PREFIX}:planting`;
const PLANTING_MAP_CACHE_KEY_PATTERN = `${PLANTING_MAP_CACHE_KEY_PREFIX}:*`;

let redisClient: RedisClientType | null = null;
let redisConnection: Promise<RedisClientType | null> | null = null;

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

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;

  if (redisClient?.isOpen) return redisClient;

  if (!redisConnection) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => {
      console.error('[map-cache] Redis error:', err);
    });

    redisConnection = client
      .connect()
      .then(() => {
        redisClient = client as RedisClientType;
        return redisClient;
      })
      .catch((err) => {
        console.error('[map-cache] Redis connection failed:', err);
        redisClient = null;
        redisConnection = null;
        return null;
      });
  }

  const client = await redisConnection;
  return client;
}

export async function getCachedMapData<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const cached = await client.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (err) {
    console.error('[map-cache] read failed:', err);
    return null;
  }
}

export async function setCachedMapData<T>(key: string, value: T): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), { EX: MAP_CACHE_TTL_SECONDS });
  } catch (err) {
    console.error('[map-cache] write failed:', err);
  }
}

export async function invalidateMapCoordinateCache(): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    const plantingMapKeys = await client.keys(PLANTING_MAP_CACHE_KEY_PATTERN);
    await Promise.all([
      client.del(MAP_REGIONS_CACHE_KEY),
      plantingMapKeys.length > 0 ? client.del(plantingMapKeys) : Promise.resolve(0),
    ]);
  } catch (err) {
    console.error('[map-cache] invalidation failed:', err);
  }
}

export { MAP_CACHE_TTL_SECONDS, MAP_REGIONS_CACHE_KEY };
