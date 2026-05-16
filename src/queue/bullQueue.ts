import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { logger } from '../config/logger';

export const BULL_QUEUE_NAME = 'image-processing';

export interface ImageJobData {
  jobId: string;
}

let _queue: Queue<ImageJobData> | null = null;

/**
 * Creates a BullMQ Queue bound to the given ioredis connection.
 * Returns null if `redis` is null (Redis unavailable).
 */
export function createBullQueue(redis: Redis | null): Queue<ImageJobData> | null {
  if (!redis) return null;

  _queue = new Queue<ImageJobData>(BULL_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });

  logger.info({ queue: BULL_QUEUE_NAME }, 'BullMQ queue created');
  return _queue;
}

/** Returns the cached BullMQ queue (null if BullMQ is not in use). */
export function getBullQueue(): Queue<ImageJobData> | null {
  return _queue;
}
