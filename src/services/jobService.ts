import createError from 'http-errors';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import type {
  JobStatus,
  JobStatusData,
  JobListData,
  JobListItem,
  JobListQuery,
} from '../types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Maps a Prisma JobStatus enum value to the local union type. */
function toJobStatus(raw: string): JobStatus {
  const valid: JobStatus[] = ['pending', 'processing', 'completed', 'failed'];
  if (valid.includes(raw as JobStatus)) return raw as JobStatus;
  return 'pending';
}

// ---------------------------------------------------------------------------
// Job service
// ---------------------------------------------------------------------------

export const jobService = {
  /**
   * Fetch a single job by its primary key.
   * Throws 404 if the record does not exist.
   */
  async getById(id: string): Promise<JobStatusData> {
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw createError(404, `Job not found: ${id}`);
    }

    return {
      jobId: job.id,
      status: toJobStatus(job.status),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },

  /**
   * List jobs with optional status filter and pagination.
   * Returns the page of results plus the total count for the filter.
   */
  async list(query: JobListQuery): Promise<JobListData> {
    const { status, limit, offset, sortBy, sortOrder } = query;

    const where = status ? { status: status as JobStatus } : {};

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
        select: {
          id: true,
          originalFilename: true,
          storedFilename: true,
          mimeType: true,
          fileSize: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.job.count({ where }),
    ]);

    const mapped: JobListItem[] = jobs.map((j) => ({
      id: j.id,
      originalFilename: j.originalFilename,
      storedFilename: j.storedFilename,
      mimeType: j.mimeType,
      fileSize: j.fileSize,
      status: toJobStatus(j.status),
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));

    const hasMore = offset + limit < total;
    const nextOffset = hasMore ? offset + limit : null;

    return {
      jobs: mapped,
      total,
      limit,
      offset,
      hasMore,
      nextOffset,
    };
  },

  /**
   * Transition a job's status to `processing`.
   * Throws 404 if the job does not exist.
   */
  async markProcessing(id: string): Promise<void> {
    const exists = await prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw createError(404, `Job not found: ${id}`);

    await prisma.job.update({
      where: { id },
      data: { status: 'processing' },
    });
  },

  /**
   * Transition a job's status to `completed` and optionally write a
   * `JobResult` record.
   *
   * Phase 1: called immediately after insert as a stub.
   * Phase 2: called by the BullMQ worker after real processing.
   */
  async markCompleted(
    id: string,
    result?: {
      checks: Record<string, unknown>;
      overallPassed: boolean;
      overallConfidence: number;
      isDuplicate?: boolean;
      duplicateOfJobId?: string | null;
    },
  ): Promise<void> {
    const exists = await prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw createError(404, `Job not found: ${id}`);

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: { status: 'completed' },
      });

      if (result) {
        const checksJson = result.checks as unknown as Prisma.InputJsonValue;
        await tx.jobResult.upsert({
          where: { jobId: id },
          create: {
            jobId: id,
            checks: checksJson,
            overallPassed: result.overallPassed,
            overallConfidence: result.overallConfidence,
            isDuplicate: result.isDuplicate ?? false,
            duplicateOfJobId: result.duplicateOfJobId ?? null,
          },
          update: {
            checks: checksJson,
            overallPassed: result.overallPassed,
            overallConfidence: result.overallConfidence,
            isDuplicate: result.isDuplicate ?? false,
            duplicateOfJobId: result.duplicateOfJobId ?? null,
          },
        });
      }
    });
  },

  /**
   * Transition a job's status to `failed` and record the failure reason.
   * Throws 404 if the job does not exist.
   */
  async markFailed(id: string, reason: string): Promise<void> {
    const exists = await prisma.job.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw createError(404, `Job not found: ${id}`);

    await prisma.job.update({
      where: { id },
      data: {
        status: 'failed',
        failureReason: reason,
      },
    });
  },

  /**
   * Fetches a Job and its associated JobResult in a single query.
   * Used by the GET /api/jobs/:id/result endpoint.
   * Throws 404 if the job does not exist.
   */
  async getWithResult(id: string) {
    const job = await prisma.job.findUnique({
      where: { id },
      include: { result: true },
    });

    if (!job) {
      throw createError(404, `Job not found: ${id}`);
    }

    return job;
  },

  /**
   * Fetches failure details for a job.
   * Throws 404 if not found.
   * Throws 400 if the job is not in 'failed' status.
   */
  async getFailureDetails(id: string) {
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        failureReason: true,
        updatedAt: true,
        attempts: true,
      },
    });

    if (!job) {
      throw createError(404, `Job not found: ${id}`);
    }

    if (job.status !== 'failed') {
      throw createError(400, 'Job has not failed');
    }

    return {
      jobId: job.id,
      status: job.status,
      failureReason: job.failureReason,
      failedAt: job.updatedAt,
      attempts: job.attempts,
    };
  },
};
