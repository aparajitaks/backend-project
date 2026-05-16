/**
 * server.ts — Entry point.
 *
 * Responsibilities:
 *  1. Validate environment (via config/env.ts import side-effect)
 *  2. Ensure the upload directory exists
 *  3. Start the HTTP server
 *  4. Start the job processing worker (BullMQ or in-memory fallback)
 *  5. Register graceful shutdown handlers for SIGTERM / SIGINT
 */

import { env } from './config/env';
import { disconnectPrisma } from './config/db';
import { ensureUploadDirExists } from './utils/fileHelpers';
import { logger } from './middleware/requestLogger';
import { startWorker } from './queue/index';
import { app } from './app';
import http from 'http';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  // Ensure the upload directory is ready before accepting requests
  try {
    ensureUploadDirExists();
    logger.info({ uploadDir: env.UPLOAD_DIR }, 'Upload directory ready');
  } catch (err) {
    logger.fatal({ err }, 'Failed to create upload directory — aborting');
    process.exit(1);
  }

  // Create and start the HTTP server
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          env: env.NODE_ENV,
          uploadDir: env.UPLOAD_DIR,
          maxFileSizeMb: env.MAX_FILE_SIZE_MB,
        },
        `🚀  Server listening on http://localhost:${env.PORT}`,
      );
      resolve();
    });
  });

  // Start async job worker AFTER server is listening
  await startWorker();

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received — closing server…');

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await disconnectPrisma();
        logger.info('Prisma disconnected');
      } catch (err) {
        logger.error({ err }, 'Error disconnecting Prisma');
      }
      logger.info('Goodbye 👋');
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
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
  logger.fatal({ err }, 'Fatal bootstrap error');
  process.exit(1);
});
