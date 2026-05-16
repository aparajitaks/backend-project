import fs from 'fs';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import createError from 'http-errors';
import { prisma } from '../config/db';
import { MAX_FILE_SIZE_BYTES } from '../config/env';
import {
  ensureUploadDirExists,
  buildStoredFilename,
  buildStoredFile,
  resolveUploadDir,
} from '../utils/fileHelpers';
import { jobService } from './jobService';
import type { StoredFile, UploadSuccessData } from '../types';

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

// ---------------------------------------------------------------------------
// Multer configuration
// ---------------------------------------------------------------------------

/**
 * Multer disk storage engine.
 * Files are saved to UPLOAD_DIR under a collision-resistant filename.
 */
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDirExists();
    cb(null, resolveUploadDir());
  },
  filename(_req, file, cb) {
    const storedFilename = buildStoredFilename(file.mimetype);
    cb(null, storedFilename);
  },
});

/**
 * MIME-type filter — rejects files that are not jpeg, png, or webp.
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      createError(
        400,
        `Unsupported file type "${file.mimetype}". Allowed: jpeg, png, webp.`,
      ),
    );
  }
};

/** Configured Multer instance — exported so the route can apply it. */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

// ---------------------------------------------------------------------------
// Upload service
// ---------------------------------------------------------------------------

export interface UploadResult extends UploadSuccessData {
  storedPath: string;
}

/**
 * Persists the uploaded file record to the database and runs the stub
 * processing step (marks the job completed immediately — Phase 2 replaces
 * this with a real async worker).
 *
 * @param file - The `Express.Multer.File` object provided by Multer.
 * @returns     An `UploadResult` containing all fields needed by the response.
 */
export async function processUpload(
  file: Express.Multer.File,
): Promise<UploadResult> {
  // 1. Build the stored-file descriptor
  const storedFile: StoredFile = buildStoredFile(
    file.originalname,
    file.filename,
    file.mimetype,
    file.size,
  );

  // 2. Verify the file actually landed on disk before touching the database
  if (!fs.existsSync(storedFile.storedPath)) {
    throw createError(500, 'File was not saved to disk correctly.');
  }

  // 3. Insert the Job row with status = pending
  const job = await prisma.job.create({
    data: {
      originalFilename: storedFile.originalFilename,
      storedFilename: storedFile.storedFilename,
      storedPath: storedFile.storedPath,
      mimeType: storedFile.mimeType,
      fileSize: storedFile.fileSize,
      status: 'pending',
    },
  });

  // 4. Phase-1 stub: immediately mark the job as completed.
  //    Phase 2 will replace this with a BullMQ enqueue call.
  await jobService.markCompleted(job.id);

  return {
    jobId: job.id,
    status: 'completed',
    filename: storedFile.storedFilename,
    fileSize: storedFile.fileSize,
    uploadedAt: job.createdAt.toISOString(),
    storedPath: storedFile.storedPath,
  };
}

/**
 * Safely removes a file from disk.  Used as a cleanup step when the DB
 * insert fails after Multer has already written the file.
 */
export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Non-fatal; swallowed intentionally to avoid masking the primary error
  }
}
