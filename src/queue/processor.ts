import fs from 'fs';
import { prisma } from '../config/db';
import { runAllChecks } from '../analysis/runner';
import { logger } from '../middleware/requestLogger';
import type { CheckResult } from '../analysis/types';
import { Prisma } from '@prisma/client';

/**
 * Core job processor. Called by both the BullMQ worker and the in-memory
 * queue listener with the jobId to process.
 *
 * Steps:
 *  1. Load Job from DB — abort with error if not found.
 *  2. Verify the stored file exists on disk.
 *  3. Transition status → processing.
 *  4. Run all image analysis checks.
 *  5. Upsert JobResult.
 *  6. Update Job.imageHash + status → completed.
 *
 * On any error:
 *  - Set Job.status = failed, Job.failureReason = error.message.
 *  - Rethrow so the queue layer can handle retries / DLQ.
 */
export async function processJob(jobId: string): Promise<void> {
  const startTime = Date.now();
  const log = logger.child({ jobId });

  // ── 1. Load job ───────────────────────────────────────────────────────────
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found in database`);
  }

  // ── 2. Verify file on disk ────────────────────────────────────────────────
  if (!fs.existsSync(job.storedPath)) {
    await markFailed(jobId, `Stored file not found on disk: ${job.storedPath}`);
    throw new Error(`Stored file not found: ${job.storedPath}`);
  }

  try {
    // ── 3. Mark processing and increment attempts ───────────────────────────
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        attempts: { increment: 1 }
      },
    });

    log.info({ jobId, storedPath: job.storedPath }, 'job.processing.start');

    // ── 4. Run analysis ─────────────────────────────────────────────────────
    const result = await runAllChecks(job.storedPath, jobId);

    // ── 5. Upsert JobResult ─────────────────────────────────────────────────
    const checksJson = result.checks as unknown as Prisma.InputJsonValue;

    const duplicateCheck = result.checks.find((c) => c.name === 'duplicateDetection') as
      | CheckResult
      | undefined;
    const isDuplicate = duplicateCheck ? !duplicateCheck.passed : false;
    const duplicateOfJobId =
      isDuplicate && duplicateCheck
        ? extractDuplicateId(duplicateCheck.detail)
        : null;

    await prisma.jobResult.upsert({
      where: { jobId },
      create: {
        jobId,
        checks: checksJson,
        overallPassed: result.overallPassed,
        overallConfidence: result.overallConfidence,
        isDuplicate,
        duplicateOfJobId,
      },
      update: {
        checks: checksJson,
        overallPassed: result.overallPassed,
        overallConfidence: result.overallConfidence,
        isDuplicate,
        duplicateOfJobId,
      },
    });

    // ── 6. Mark completed ───────────────────────────────────────────────────
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        imageHash: result.imageHash || null,
      },
    });

    log.info(
      {
        jobId,
        overallPassed: result.overallPassed,
        overallConfidence: result.overallConfidence,
        durationMs: Date.now() - startTime,
      },
      'job.completed'
    );
  } catch (err: unknown) {
    // failure logging is handled by queue index.ts and inMemoryQueue.ts
    // markFailed is handled by them on final attempt
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markFailed(jobId: string, reason: string): Promise<void> {
  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', failureReason: reason },
    });
  } catch (updateErr) {
    logger.error({ jobId, updateErr }, 'Failed to update job status to failed');
  }
}

/**
 * Extracts the referenced job ID from a duplicate detection detail string.
 * Format: "Duplicate of job <id>"
 */
function extractDuplicateId(detail: string): string | null {
  const match = /Duplicate of job (.+)$/.exec(detail);
  return match?.[1] ?? null;
}
