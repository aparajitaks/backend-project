import Redis from 'ioredis';
import { Worker } from 'bullmq';
import { initRedisClient } from './redisClient';
import { createBullQueue, getBullQueue, BULL_QUEUE_NAME } from './bullQueue';
import type { ImageJobData } from './bullQueue';
import { inMemoryQueue } from './inMemoryQueue';
import { processJob } from './processor';
import { logger } from '../config/logger';
import { jobService } from '../services/jobService';

// ---------------------------------------------------------------------------
// enqueueJob
// ---------------------------------------------------------------------------

export async function enqueueJob(jobId: string): Promise<void> {
  const bullQueue = getBullQueue();

  if (bullQueue) {
    await bullQueue.add('process-image', { jobId } satisfies ImageJobData, {
      jobId,
    });
    logger.info({ jobId, queue: 'bullmq' }, 'job.enqueued');
  } else {
    inMemoryQueue.enqueue(jobId);
    logger.info({ jobId, queue: 'memory' }, 'job.enqueued');
  }
}

// ---------------------------------------------------------------------------
// startWorker
// ---------------------------------------------------------------------------

export async function startWorker(): Promise<void> {
  const redis: Redis | null = await initRedisClient();

  if (redis) {
    createBullQueue(redis);

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
      // job.completed is logged inside processJob now (where duration, confidence, etc. are known)
      // We can just log worker success here if needed, but not duplicating job.completed
    });

    worker.on('failed', async (job, err) => {
      if (!job) return;
      const attempt = job.attemptsMade;
      const maxAttempts = job.opts.attempts ?? 3;
      
      if (attempt < maxAttempts) {
        // Not final failure
        const delay = Math.pow(2, attempt - 1) * 1000; // rough estimation of backoff for log
        logger.error(
          { jobId: job.data.jobId, attempt, error: err.message, nextRetryIn: delay },
          'job.failed'
        );
      } else {
        // Final failure
        logger.error(
          { jobId: job.data.jobId, attempt, error: err.message, failureReason: 'Max attempts exhausted' },
          'job.failed'
        );
        await jobService.markFailed(job.data.jobId, err.message).catch(() => {});
      }
    });

    worker.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ worker error');
    });

    logger.info({ queue: BULL_QUEUE_NAME, concurrency: 5 }, 'BullMQ worker started');
  } else {
    // In-memory path listener moved to inMemoryQueue itself for retry logic encapsulation,
    // or we can implement it here. Let's do it in inMemoryQueue and just call start listener.
    inMemoryQueue.startListener();
    
    logger.warn(
      'Running with in-memory queue — jobs will be lost on restart. Configure REDIS_URL for production.',
    );
  }
}
