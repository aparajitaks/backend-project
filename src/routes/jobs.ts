import { Router } from 'express';
import { getJobStatus, listJobs } from '../controllers/jobController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/jobs
 * List all jobs with optional ?status, ?limit, ?offset query params.
 */
router.get('/', asyncHandler(listJobs));

/**
 * GET /api/jobs/:id/status
 * Fetch the status of a specific job by its cuid.
 */
router.get('/:id/status', asyncHandler(getJobStatus));

export default router;
