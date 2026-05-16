import { Router } from 'express';
import uploadRouter from './upload';
import jobsRouter from './jobs';
import healthRouter from './health';

const router = Router();

/**
 * Mounts all sub-routers under /api.
 *
 * Final URL layout:
 *   POST   /api/upload
 *   GET    /api/jobs
 *   GET    /api/jobs/:id/status
 *   GET    /api/health
 */
router.use('/upload', uploadRouter);
router.use('/jobs', jobsRouter);
router.use('/health', healthRouter);

export default router;
