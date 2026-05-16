/**
 * worker.ts — Standalone entry point for the background worker.
 *
 * Runs only the job processing queue listener. Does not start the HTTP API.
 */

import { env } from './config/env';
import { disconnectPrisma } from './config/db';
import { logger } from './config/logger';
import { startWorker } from './queue/index';

async function bootstrap(): Promise<void> {
  // We do not need to ensure upload dir exists here since the API handles uploads,
  // but it doesn't hurt and helps if the worker starts first.
  const { ensureUploadDirExists } = await import('./utils/fileHelpers');
  try {
    ensureUploadDirExists();
  } catch (err) {
    logger.warn({ err }, 'Worker: Failed to create upload directory. Assuming API will create it.');
  }

  // Start async job worker
  await startWorker();
  logger.info({ env: env.NODE_ENV }, '⚙️ Worker listening for jobs...');

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received — closing worker…');

    try {
      await disconnectPrisma();
      logger.info('Prisma disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting Prisma');
    }
    logger.info('Worker shutdown complete 👋');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((err: unknown) => {
  logger.fatal({ err }, 'Fatal bootstrap error in worker');
  process.exit(1);
});
