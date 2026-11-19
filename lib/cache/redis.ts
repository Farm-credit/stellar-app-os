/**
 * Central Redis client manager
 *
 * Provides singleton Redis clients for the whole app.
 * Supports single instance via REDIS_URL and multi-instance via REDIS_URLS
 * (comma-separated) for Redlock.
 *
 * Production notes:
 * - Clients are lazy-connected on first use.
 * - If REDIS_URL is not set, getRedisClient() returns null and callers should
 *   fall back to in-memory implementations.
 * - For tests, use closeRedisClients() to reset state.
 */

import { createClient, type RedisClientType } from 'redis';
import logger from '@/lib/logger';

type RedisClient = RedisClientType;

let primaryClient: RedisClient | null = null;
let primaryConnection: Promise<RedisClient | null> | null = null;

let multiClients: RedisClient[] | null = null;
let multiConnections: Promise<RedisClient[]> | null = null;

function parseRedisUrls(): string[] {
  const urlsEnv = process.env.REDIS_URLS?.trim();
  if (urlsEnv) {
    return urlsEnv
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }
  const single = process.env.REDIS_URL?.trim();
  if (single) return [single];
  return [];
}

export function getRedisUrls(): string[] {
  return parseRedisUrls();
}

export function hasRedisConfigured(): boolean {
  return parseRedisUrls().length > 0;
}

async function createAndConnect(url: string): Promise<RedisClient | null> {
  try {
    const client = createClient({ url }) as RedisClient;
    client.on('error', (err: unknown) => {
      logger.error('[redis] Redis error', { url: url.replace(/:\/\/.*@/, '://***@'), err });
    });
    await client.connect();
    logger.info('[redis] Connected', { url: url.replace(/:\/\/.*@/, '://***@') });
    return client;
  } catch (err) {
    logger.error('[redis] Connection failed', { url: url.replace(/:\/\/.*@/, '://***@'), err });
    return null;
  }
}

export async function getRedisClient(): Promise<RedisClient | null> {
  const urls = parseRedisUrls();
  if (urls.length === 0) return null;

  if (primaryClient?.isOpen) return primaryClient;

  if (!primaryConnection) {
    primaryConnection = (async () => {
      const client = await createAndConnect(urls[0]);
      if (client) primaryClient = client;
      else primaryConnection = null;
      return client;
    })();
  }

  return primaryConnection;
}

export async function getRedisClients(): Promise<RedisClient[]> {
  const urls = parseRedisUrls();
  if (urls.length === 0) return [];

  if (multiClients && multiClients.length > 0 && multiClients.every((c) => c.isOpen)) {
    return multiClients;
  }

  if (!multiConnections) {
    multiConnections = (async () => {
      const clients: RedisClient[] = [];
      for (const url of urls) {
        const c = await createAndConnect(url);
        if (c) clients.push(c);
      }
      if (clients.length > 0) {
        multiClients = clients;
        // Also set primary if not set
        if (!primaryClient && clients[0]) {
          primaryClient = clients[0];
        }
      } else {
        multiConnections = null;
      }
      return clients;
    })();
  }

  const result = await multiConnections;
  return result ?? [];
}

/**
 * Close all redis clients - useful for tests and graceful shutdown
 */
export async function closeRedisClients(): Promise<void> {
  try {
    if (primaryClient) {
      await primaryClient.quit().catch(() => primaryClient?.disconnect());
      primaryClient = null;
    }
    primaryConnection = null;

    if (multiClients) {
      await Promise.all(multiClients.map((c) => c.quit().catch(() => c.disconnect())));
      multiClients = null;
    }
    multiConnections = null;
  } catch (err) {
    logger.error('[redis] Error while closing clients', { err });
  }
}

// Synchronous check for testing/mocking purposes
export function __resetForTests(): void {
  primaryClient = null;
  primaryConnection = null;
  multiClients = null;
  multiConnections = null;
}
