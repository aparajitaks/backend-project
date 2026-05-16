// WARNING: jobs lost on restart. Use Redis in production.

import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import { processJob } from './processor';
import { jobService } from '../services/jobService';

const PROCESS_DELAY_MS = 100;
const RETRY_DELAYS = [1000, 4000, 16000]; // attempts: 1st, 2nd, 3rd

class InMemoryQueue extends EventEmitter {
  enqueue(jobId: string): void {
    setTimeout(() => {
      this.emit('process', { jobId, attempt: 1 });
    }, PROCESS_DELAY_MS);
  }

  startListener(): void {
    this.on('process', async ({ jobId, attempt }: { jobId: string; attempt: number }) => {
      try {
        await processJob(jobId);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (attempt <= RETRY_DELAYS.length) {
          const nextRetryIn = RETRY_DELAYS[attempt - 1] ?? 1000;
          logger.error(
            { jobId, attempt, error: errorMsg, nextRetryIn },
            'job.failed'
          );
          setTimeout(() => {
            this.emit('process', { jobId, attempt: attempt + 1 });
          }, nextRetryIn);
        } else {
          logger.error(
            { jobId, attempt, error: errorMsg, failureReason: 'Max attempts exhausted' },
            'job.failed'
          );
          await jobService.markFailed(jobId, errorMsg).catch(() => {});
        }
      }
    });
  }
}

export const inMemoryQueue = new InMemoryQueue();
