import type { Request, Response } from 'express';
import { z } from 'zod';
import createError from 'http-errors';
import { jobService } from '../services/jobService';
import type { ApiResponse, JobStatusData, JobListData, JobStatus } from '../types';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const jobStatusEnum = z.enum(['pending', 'processing', 'completed', 'failed']);

const listQuerySchema = z.object({
  status: jobStatusEnum.optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a positive integer')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('20'),
  offset: z
    .string()
    .regex(/^\d+$/, 'offset must be a non-negative integer')
    .transform(Number)
    .pipe(z.number().int().min(0))
    .optional()
    .default('0'),
});

const idParamSchema = z.object({
  id: z.string().min(1, 'Job ID must be a non-empty string.'),
});

// ---------------------------------------------------------------------------
// Controller handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/jobs/:id/status
 *
 * Fetches the current status of a single job.
 * Returns 404 via the service layer if the job does not exist.
 */
export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const paramParsed = idParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    throw createError(400, paramParsed.error.errors[0]?.message ?? 'Invalid job ID.');
  }

  const { id } = paramParsed.data;
  const job: JobStatusData = await jobService.getById(id);

  const payload: ApiResponse<JobStatusData> = {
    success: true,
    data: job,
  };

  res.status(200).json(payload);
}

/**
 * GET /api/jobs
 *
 * Lists jobs with optional status filter and limit/offset pagination.
 * Query params:
 *  - status?  : JobStatus
 *  - limit?   : number (1–100, default 20)
 *  - offset?  : number (≥ 0, default 0)
 */
export async function listJobs(req: Request, res: Response): Promise<void> {
  const queryParsed = listQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    const first = queryParsed.error.errors[0];
    throw createError(400, first?.message ?? 'Invalid query parameters.');
  }

  const { status, limit, offset } = queryParsed.data;

  const result: JobListData = await jobService.list({
    status: status as JobStatus | undefined,
    limit,
    offset,
  });

  const payload: ApiResponse<JobListData> = {
    success: true,
    data: result,
    meta: {
      limit,
      offset,
      total: result.total,
    },
  };

  res.status(200).json(payload);
}
