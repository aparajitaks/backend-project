import express, { type Application, type Request, type Response } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import type { ApiResponse } from './types';

/**
 * Creates and configures the Express application.
 *
 * Middleware order:
 *  1. Request logger  (first, so every request is recorded)
 *  2. Body parsers    (JSON + URL-encoded)
 *  3. API routes      (/api/*)
 *  4. 404 catch-all
 *  5. Global error handler (must be last, must have 4-arg signature)
 */
function createApp(): Application {
  const app = express();

  // ── 1. Request logging ───────────────────────────────────────────────────
  app.use(requestLogger);

  // ── 2. Body parsers ──────────────────────────────────────────────────────
  // Multipart requests are handled by Multer inside the upload route;
  // we still want JSON parsing for all other endpoints.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── 3. API routes ────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── 3a. Root route ───────────────────────────────────────────────────────
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Image Processing Pipeline API Running 🚀',
      environment: process.env['NODE_ENV'] || 'development',
    });
  });

  // ── 3b. Health check route ───────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── 4. 404 fallback ──────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    const payload: ApiResponse = {
      success: false,
      error: 'Route not found.',
    };
    res.status(404).json(payload);
  });

  // ── 5. Global error handler ──────────────────────────────────────────────
  // Intentionally has the (err, req, res, next) signature — do not remove _next.
  app.use(errorHandler);

  return app;
}

export const app = createApp();
