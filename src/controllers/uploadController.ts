import type { Request, Response } from 'express';
import { z } from 'zod';
import createError from 'http-errors';
import { processUpload } from '../services/uploadService';
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
    .max(
      10 * 1024 * 1024,
      'File size must not exceed the configured maximum.',
    ),
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
 *  1. Confirm Multer provided a file (guards against missing field).
 *  2. Validate file metadata with Zod.
 *  3. Delegate to `uploadService.processUpload` which handles DB + stub processing.
 *  4. Return the ApiResponse envelope.
 */
export async function handleUpload(req: Request, res: Response): Promise<void> {
  // 1. Guard — Multer sets req.file when a file was received
  if (!req.file) {
    throw createError(
      400,
      'No file received. Send a multipart/form-data request with an "image" field.',
    );
  }

  // 2. Validate file metadata via Zod (belt-and-suspenders on top of Multer's filter)
  const validation = uploadFileSchema.safeParse({
    mimetype: req.file.mimetype,
    size: req.file.size,
    originalname: req.file.originalname,
  });

  if (!validation.success) {
    throw createError(400, validation.error.errors[0]?.message ?? 'Invalid file.');
  }

  // 3. Process: persist to DB, stub-complete
  const result = await processUpload(req.file);

  // 4. Respond
  const payload: ApiResponse<UploadSuccessData> = {
    success: true,
    data: {
      jobId: result.jobId,
      status: result.status,
      filename: result.filename,
      fileSize: result.fileSize,
      uploadedAt: result.uploadedAt,
    },
  };

  res.status(201).json(payload);
}
