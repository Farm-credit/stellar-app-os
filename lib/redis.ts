import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;

// Create a singleton Redis client instance
export const redis = redisUrl ? createClient({ url: redisUrl }) : null;

if (redis) {
  redis.on('error', (err) => console.error('Redis Client Error:', err));

  // Connect eagerly if URL is provided
  redis.connect().catch(console.error);
}

export type RedisClientType = typeof redis;
