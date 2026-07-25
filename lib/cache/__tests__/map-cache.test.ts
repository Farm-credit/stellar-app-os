import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import {
  MAP_CACHE_TTL_SECONDS,
  MAP_REGIONS_CACHE_KEY,
  getCachedMapData,
  getPlantingMapCacheKey,
  invalidateMapCoordinateCache,
  setCachedMapData,
} from '@/lib/cache/map-cache';

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

const redisClient = {
  isOpen: true,
  connect: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  on: vi.fn(),
};

describe('map-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    vi.mocked(createClient).mockReturnValue(redisClient as never);
    redisClient.connect.mockResolvedValue(redisClient as never);
    redisClient.get.mockReset();
    redisClient.set.mockReset();
    redisClient.del.mockReset();
    redisClient.keys.mockReset();
    redisClient.on.mockReset();
  });

  it('builds stable planting map cache keys', () => {
    expect(getPlantingMapCacheKey(null)).toBe('map:gps-coordinates:planting:all');
    expect(getPlantingMapCacheKey('kano')).toBe('map:gps-coordinates:planting:kano');
  });

  it('stores map data with a five-minute TTL', async () => {
    await setCachedMapData(MAP_REGIONS_CACHE_KEY, [{ regionKey: 'r1' }]);

    expect(redisClient.set).toHaveBeenCalledWith(
      MAP_REGIONS_CACHE_KEY,
      JSON.stringify([{ regionKey: 'r1' }]),
      { EX: MAP_CACHE_TTL_SECONDS }
    );
    expect(MAP_CACHE_TTL_SECONDS).toBe(300);
  });

  it('reads JSON map data from Redis', async () => {
    redisClient.get.mockResolvedValue(JSON.stringify([{ geohash: 'abc', treeCount: 2 }]));

    await expect(getCachedMapData('map:gps-coordinates:planting:all')).resolves.toEqual([
      { geohash: 'abc', treeCount: 2 },
    ]);
  });

  it('invalidates region and planting coordinate caches', async () => {
    redisClient.keys.mockResolvedValue([
      'map:gps-coordinates:planting:all',
      'map:gps-coordinates:planting:kano',
    ]);
    redisClient.del.mockResolvedValue(1);

    await invalidateMapCoordinateCache();

    expect(redisClient.keys).toHaveBeenCalledWith('map:gps-coordinates:planting:*');
    expect(redisClient.del).toHaveBeenCalledWith(MAP_REGIONS_CACHE_KEY);
    expect(redisClient.del).toHaveBeenCalledWith([
      'map:gps-coordinates:planting:all',
      'map:gps-coordinates:planting:kano',
    ]);
  });

  it('skips Redis work when REDIS_URL is not configured', async () => {
    delete process.env.REDIS_URL;

    await setCachedMapData(MAP_REGIONS_CACHE_KEY, []);
    await invalidateMapCoordinateCache();

    expect(createClient).not.toHaveBeenCalled();
  });
});
