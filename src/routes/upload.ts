import { Router } from 'express';
import { upload } from '../services/uploadService';
import { handleUpload } from '../controllers/uploadController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * POST /api/upload
 *
 * Accepts a single `image` field (multipart/form-data).
 * Multer validates size and persists the file to disk before the controller runs.
 * asyncHandler forwards any errors (including Multer's) to the global error handler.
 */
router.post(
  '/',
  upload.single('image'),
  asyncHandler(handleUpload),
);

export default router;
