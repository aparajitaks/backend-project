import { Router } from 'express';
import { getJobStatus, listJobs, getResult, getJobFailure } from '../controllers/jobController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/jobs
 * List all jobs with optional ?status, ?limit, ?offset query params.
 */
router.get('/', asyncHandler(listJobs));

/**
 * GET /api/jobs/:id/status
 * Fetch the current status of a specific job.
 */
router.get('/:id/status', asyncHandler(getJobStatus));

/**
 * GET /api/jobs/:id/failure
 * Fetch failure details of a specific failed job.
 */
router.get('/:id/failure', asyncHandler(getJobFailure));

/**
 * GET /api/jobs/:id/result
 * Fetch the full analysis result for a job.
 * Returns 202 while pending/processing, 422 if failed, 200 with checks if completed.
 */
router.get('/:id/result', asyncHandler(getResult));

export default router;
