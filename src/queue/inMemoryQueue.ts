// WARNING: jobs lost on restart. Use Redis in production.

import { EventEmitter } from 'events';
import { logger } from '../middleware/requestLogger';

const PROCESS_DELAY_MS = 100;

/**
 * Lightweight in-memory job queue backed by Node's EventEmitter.
 *
 * ⚠  WARNING: jobs are lost on restart. Use Redis + BullMQ in production.
 *
 * Usage:
 *   inMemoryQueue.enqueue(jobId)  → emits 'process' after 100ms
 *   inMemoryQueue.on('process', (jobId) => { ... })
 */
class InMemoryQueue extends EventEmitter {
  /** Queues a jobId for processing after a short delay. */
  enqueue(jobId: string): void {
    logger.debug({ jobId }, 'In-memory queue: enqueuing job');
    setTimeout(() => {
      this.emit('process', jobId);
    }, PROCESS_DELAY_MS);
  }
}

export const inMemoryQueue = new InMemoryQueue();
