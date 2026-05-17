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

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDirExists();
    cb(null, resolveUploadDir());
  },
  filename(_req, file, cb) {
    cb(null, buildStoredFilename(file.mimetype));
  },
});

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

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

// ---------------------------------------------------------------------------
// Upload service
// ---------------------------------------------------------------------------

export interface UploadResult extends UploadSuccessData {
  storedPath: string;
}

/**
 * Saves the uploaded file descriptor to the database with status=pending.
 * The caller (uploadController) is responsible for enqueueing async processing.
 */
export async function processUpload(
  file: Express.Multer.File,
): Promise<UploadResult> {
  const storedFile: StoredFile = buildStoredFile(
    file.originalname,
    file.filename,
    file.mimetype,
    file.size,
  );

  if (!fs.existsSync(storedFile.storedPath)) {
    throw createError(500, 'File was not saved to disk correctly.');
  }

  // Sharp validation is deferred to the asynchronous worker 
  // so that corrupted files are accepted initially and failed gracefully during processing.

  const job = await prisma.job.create({
    data: {
      originalFilename: storedFile.originalFilename,
      storedFilename:   storedFile.storedFilename,
      storedPath:       storedFile.storedPath,
      mimeType:         storedFile.mimeType,
      fileSize:         storedFile.fileSize,
      status:           'pending',
    },
  });

  return {
    jobId:      job.id,
    status:     'pending',
    filename:   storedFile.storedFilename,
    fileSize:   storedFile.fileSize,
    uploadedAt: job.createdAt.toISOString(),
    storedPath: storedFile.storedPath,
  };
}

export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Non-fatal
  }
}
