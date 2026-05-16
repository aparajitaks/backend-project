import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

const CONNECT_TIMEOUT_MS = 3000;

let _client: Redis | null = null;

/**
 * Attempts to connect to Redis with a 3-second timeout.
 * On timeout or connection error, logs a warning and resolves to null
 * so the application can fall back to the in-memory queue.
 */
export async function initRedisClient(): Promise<Redis | null> {
  return new Promise((resolve) => {
    const client = new Redis(env.REDIS_URL, {
      lazyConnect: true,           // don't connect until .connect() is called
      maxRetriesPerRequest: null,  // required by BullMQ
      enableOfflineQueue: false,   // reject commands immediately if disconnected
      connectTimeout: CONNECT_TIMEOUT_MS,
    });

    const timer = setTimeout(() => {
      logger.warn('Redis unavailable — falling back to in-memory queue');
      client.disconnect();
      resolve(null);
    }, CONNECT_TIMEOUT_MS);

    client.once('ready', () => {
      clearTimeout(timer);
      logger.info({ url: env.REDIS_URL }, 'Redis connected');
      _client = client;
      resolve(client);
    });

    client.once('error', (err: Error) => {
      clearTimeout(timer);
      logger.warn({ err: err.message }, 'Redis connection error — falling back to in-memory queue');
      client.disconnect();
      resolve(null);
    });

    // Kick off the connection attempt
    client.connect().catch(() => {
      // Handled by the 'error' event above
    });
  });
}

/** Returns the cached Redis client (null if unavailable). */
export function getRedisClient(): Redis | null {
  return _client;
}
