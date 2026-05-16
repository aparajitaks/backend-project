import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../config/db';
import { asyncHandler } from '../middleware/asyncHandler';
import type { ApiResponse, HealthData } from '../types';

const router = Router();

/**
 * GET /api/health
 *
 * Performs a lightweight `SELECT 1` against the database to verify
 * connectivity, then returns operational metadata.
 *
 * Response codes:
 *  - 200  →  status "ok",   db "connected"
 *  - 503  →  status "degraded", db "disconnected"
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    let dbConnected = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      // DB is unreachable — handled below
    }

    const healthData: HealthData = {
      status: dbConnected ? 'ok' : 'degraded',
      db: dbConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    const payload: ApiResponse<HealthData> = {
      success: dbConnected,
      data: healthData,
    };

    res.status(dbConnected ? 200 : 503).json(payload);
  }),
);

export default router;
