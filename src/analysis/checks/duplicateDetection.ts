import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../../config/db';
import type { CheckResult } from '../types';

export interface DuplicateCheckResult {
  checkResult: CheckResult;
  /** SHA-256 hex digest of the raw file bytes. */
  imageHash: string;
}

/**
 * Computes a SHA-256 hash of the raw file buffer and queries the Job table
 * for any previously completed job with the same hash (excluding the current job).
 *
 * Returns both the CheckResult and the hash so the caller can persist it.
 */
export async function checkDuplicate(
  imagePath: string,
  currentJobId: string,
): Promise<DuplicateCheckResult> {
  const fileBuffer = fs.readFileSync(imagePath);
  const imageHash = crypto
    .createHash('sha256')
    .update(fileBuffer)
    .digest('hex');

  const existing = await prisma.job.findFirst({
    where: {
      imageHash,
      status: 'completed',
      id: { not: currentJobId },
    },
    select: { id: true },
  });

  const isDuplicate = existing !== null;

  return {
    checkResult: {
      name: 'duplicateDetection',
      passed: !isDuplicate,
      confidence: isDuplicate ? 0.0 : 1.0,
      detail: isDuplicate
        ? `Duplicate of job ${existing.id}`
        : 'No duplicate found',
    },
    imageHash,
  };
}
