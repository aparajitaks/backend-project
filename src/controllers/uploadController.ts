import type { Request, Response } from 'express';
import { z } from 'zod';
import createError from 'http-errors';
import { processUpload } from '../services/uploadService';
import { enqueueJob } from '../queue/index';
import type { ApiResponse, UploadSuccessData } from '../types';

// ---------------------------------------------------------------------------
// Zod validation schema for the uploaded file metadata
// ---------------------------------------------------------------------------

const uploadFileSchema = z.object({
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({
      message: 'Only jpeg, png, and webp images are accepted.',
    }),
  }),
  size: z
    .number()
    .int()
    .positive('File size must be a positive integer.')
    .max(10 * 1024 * 1024, 'File size must not exceed the configured maximum.'),
  originalname: z.string().min(1, 'Original filename must not be empty.'),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * POST /api/upload
 *
 * Expects a multipart/form-data request with a single `image` field.
 * Multer middleware runs before this handler, so `req.file` is populated.
 *
 * Steps:
 *  1. Confirm Multer provided a file.
 *  2. Validate file metadata with Zod.
 *  3. Persist the Job row with status=pending via uploadService.
 *  4. Enqueue the jobId for async processing (BullMQ or in-memory).
 *  5. Return 201 with the job details.
 */
export async function handleUpload(req: Request, res: Response): Promise<void> {
  // 1. Guard
  if (!req.file) {
    throw createError(
      400,
      'No file received. Send a multipart/form-data request with an "image" field.',
    );
  }

  if (req.file.size === 0) {
    // Need to clean it up since Multer saved an empty file
    const { cleanupFile } = await import('../services/uploadService');
    cleanupFile(req.file.path);
    throw createError(400, 'File cannot be empty (0 bytes).');
  }

  // 2. Validate
  const validation = uploadFileSchema.safeParse({
    mimetype: req.file.mimetype,
    size: req.file.size,
    originalname: req.file.originalname,
  });

  if (!validation.success) {
    throw createError(400, validation.error.errors[0]?.message ?? 'Invalid file.');
  }

  // 3. Persist Job row (status=pending)
  const result = await processUpload(req.file);

  // 4. Enqueue for async processing — Phase 1 stub removed
  await enqueueJob(result.jobId);

  // 5. Respond
  const payload: ApiResponse<UploadSuccessData> = {
    success: true,
    data: {
      jobId: result.jobId,
      status: result.status,   // "pending" — processing is async
      filename: result.filename,
      fileSize: result.fileSize,
      uploadedAt: result.uploadedAt,
    },
  };

  res.status(201).json(payload);
}
