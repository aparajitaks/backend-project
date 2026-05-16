import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { initRedisClient } from './redisClient';
import { createBullQueue, getBullQueue, BULL_QUEUE_NAME } from './bullQueue';
import type { ImageJobData } from './bullQueue';
import { inMemoryQueue } from './inMemoryQueue';
import { processJob } from './processor';
import { logger } from '../middleware/requestLogger';

// ---------------------------------------------------------------------------
// enqueueJob
// ---------------------------------------------------------------------------

/**
 * Enqueues a job for async image processing.
 * Automatically picks BullMQ (Redis) or the in-memory queue depending on
 * what was initialised by `startWorker()`.
 */
export async function enqueueJob(jobId: string): Promise<void> {
  const bullQueue = getBullQueue();

  if (bullQueue) {
    await bullQueue.add('process-image', { jobId } satisfies ImageJobData, {
      jobId, // use the DB id as BullMQ job id for deduplication
    });
    logger.debug({ jobId }, 'Job enqueued in BullMQ');
  } else {
    inMemoryQueue.enqueue(jobId);
    logger.debug({ jobId }, 'Job enqueued in in-memory queue');
  }
}

// ---------------------------------------------------------------------------
// startWorker
// ---------------------------------------------------------------------------

/**
 * Initialises the processing backend:
 *  - Tries to connect to Redis (3s timeout).
 *  - On success: creates a BullMQ Queue + Worker with concurrency 5.
 *  - On failure: attaches a listener to the in-memory EventEmitter queue.
 *
 * Call once from server.ts after `server.listen()`.
 */
export async function startWorker(): Promise<void> {
  const redis: Redis | null = await initRedisClient();

  if (redis) {
    // ── BullMQ path ──────────────────────────────────────────────────────────
    createBullQueue(redis);

    // BullMQ Worker needs its own dedicated connection — create a duplicate
    const workerRedis = redis.duplicate();

    const worker = new Worker<ImageJobData>(
      BULL_QUEUE_NAME,
      async (job) => {
        await processJob(job.data.jobId);
      },
      {
        connection: workerRedis,
        concurrency: 5,
      },
    );

    worker.on('completed', (job) => {
      logger.info({ jobId: job.data.jobId, bullJobId: job.id }, 'BullMQ job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.data.jobId, bullJobId: job?.id, err: err.message },
        'BullMQ job failed',
      );
    });

    worker.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ worker error');
    });

    logger.info({ queue: BULL_QUEUE_NAME, concurrency: 5 }, 'BullMQ worker started');
  } else {
    // ── In-memory path ───────────────────────────────────────────────────────
    inMemoryQueue.on('process', (jobId: string) => {
      processJob(jobId).catch((err: unknown) => {
        logger.error(
          { jobId, err: err instanceof Error ? err.message : String(err) },
          'In-memory queue: job failed',
        );
      });
    });

    logger.warn(
      'Running with in-memory queue — jobs will be lost on restart. Configure REDIS_URL for production.',
    );
  }
}
