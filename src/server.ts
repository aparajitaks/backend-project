/**
 * server.ts — Entry point.
 *
 * Responsibilities:
 *  1. Validate environment (via config/env.ts import side-effect)
 *  2. Ensure the upload directory exists
 *  3. Start the HTTP server
 *  4. Register graceful shutdown handlers for SIGTERM / SIGINT
 */

import { env } from './config/env';
import { disconnectPrisma } from './config/db';
import { ensureUploadDirExists } from './utils/fileHelpers';
import { logger } from './middleware/requestLogger';
import { app } from './app';
import http from 'http';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  // Ensure the upload directory is ready before the server accepts requests
  try {
    ensureUploadDirExists();
    logger.info({ uploadDir: env.UPLOAD_DIR }, 'Upload directory ready');
  } catch (err) {
    logger.fatal({ err }, 'Failed to create upload directory — aborting');
    process.exit(1);
  }

  // Create and start the HTTP server
  const server = http.createServer(app);

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
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────

  /**
   * Gracefully stops the server:
   *  1. Stop accepting new connections.
   *  2. Disconnect Prisma so the DB connection pool is released.
   *  3. Exit.
   */
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

    // Force exit after 10 s if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Catch unhandled promise rejections so they don't silently disappear
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  // Catch synchronous uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
