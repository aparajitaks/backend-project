import type { Request, Response } from 'express';
import { z } from 'zod';
import createError from 'http-errors';
import { jobService } from '../services/jobService';
import type {
  ApiResponse,
  JobStatusData,
  JobListData,
  JobStatus,
  JobResultData,
} from '../types';

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
  sortBy: z.enum(['createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const idParamSchema = z.object({
  id: z.string().min(1, 'Job ID must be a non-empty string.'),
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/status
// ---------------------------------------------------------------------------

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const paramParsed = idParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    throw createError(400, paramParsed.error.errors[0]?.message ?? 'Invalid job ID.');
  }

  const job: JobStatusData = await jobService.getById(paramParsed.data.id);

  const payload: ApiResponse<JobStatusData> = { success: true, data: job };
  res.status(200).json(payload);
}

// ---------------------------------------------------------------------------
// GET /api/jobs
// ---------------------------------------------------------------------------

export async function listJobs(req: Request, res: Response): Promise<void> {
  const queryParsed = listQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    throw createError(400, queryParsed.error.errors[0]?.message ?? 'Invalid query parameters.');
  }

  const { status, limit, offset, sortBy, sortOrder } = queryParsed.data;
  const result: JobListData = await jobService.list({
    status: status as JobStatus | undefined,
    limit,
    offset,
    sortBy,
    sortOrder,
  });

  const payload: ApiResponse<JobListData> = {
    success: true,
    data: result,
    meta: { 
      limit, 
      offset, 
      total: result.total,
      hasMore: result.hasMore,
      nextOffset: result.nextOffset
    },
  };
  res.status(200).json(payload);
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/failure
// ---------------------------------------------------------------------------

export async function getJobFailure(req: Request, res: Response): Promise<void> {
  const paramParsed = idParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    throw createError(400, paramParsed.error.errors[0]?.message ?? 'Invalid job ID.');
  }

  const failureData = await jobService.getFailureDetails(paramParsed.data.id);

  const payload: ApiResponse<typeof failureData> = { success: true, data: failureData };
  res.status(200).json(payload);
}

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/result
// ---------------------------------------------------------------------------

/**
 * Returns the full analysis result for a completed job.
 *
 * Status-aware responses:
 *  - pending / processing → 202 with a status message
 *  - failed               → 422 with the failure reason
 *  - completed            → 200 with the full JobResult (checks array, confidence, etc.)
 */
export async function getResult(req: Request, res: Response): Promise<void> {
  const paramParsed = idParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    throw createError(400, paramParsed.error.errors[0]?.message ?? 'Invalid job ID.');
  }

  const { id } = paramParsed.data;
  const jobWithResult = await jobService.getWithResult(id);

  if (jobWithResult.status === 'pending' || jobWithResult.status === 'processing') {
    const payload: ApiResponse<{ status: string; message: string }> = {
      success: true,
      data: {
        status: jobWithResult.status,
        message: 'Job is still being processed. Check back shortly.',
      },
    };
    res.status(202).json(payload);
    return;
  }

  if (jobWithResult.status === 'failed') {
    const payload: ApiResponse<{ status: string; failureReason: string | null }> = {
      success: false,
      data: {
        status: 'failed',
        failureReason: jobWithResult.failureReason ?? 'Unknown error',
      },
      error: jobWithResult.failureReason ?? 'Job processing failed',
    };
    res.status(422).json(payload);
    return;
  }

  // completed
  if (!jobWithResult.result) {
    throw createError(500, 'Job is marked completed but has no result record.');
  }

  const payload: ApiResponse<JobResultData> = {
    success: true,
    data: {
      jobId:             jobWithResult.id,
      status:            jobWithResult.status,
      imageHash:         jobWithResult.imageHash,
      overallPassed:     jobWithResult.result.overallPassed,
      overallConfidence: jobWithResult.result.overallConfidence,
      isDuplicate:       jobWithResult.result.isDuplicate,
      duplicateOfJobId:  jobWithResult.result.duplicateOfJobId,
      checks:            jobWithResult.result.checks,
      processedAt:       jobWithResult.result.processedAt,
    },
  };
  res.status(200).json(payload);
}
