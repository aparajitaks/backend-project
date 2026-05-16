import type { Request, Response, NextFunction } from 'express';
import { isHttpError } from 'http-errors';
import type { ApiResponse } from '../types';
import { logger } from './requestLogger';

/**
 * Global Express error-handling middleware.
 *
 * Must be registered LAST in the middleware chain (after all routes).
 * Handles:
 *  - `http-errors` instances  → use their status code and message
 *  - Multer errors            → translate to 400 Bad Request
 *  - Generic `Error` objects  → 500 Internal Server Error
 *  - Non-Error throws         → 500 Internal Server Error
 *
 * All error responses follow the ApiResponse envelope.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ── http-errors ──────────────────────────────────────────────────────────
  if (isHttpError(err)) {
    const payload: ApiResponse = {
      success: false,
      error: err.message,
    };
    res.status(err.status).json(payload);
    return;
  }

  // ── Multer errors (e.g. file too large, unexpected field) ─────────────────
  if (isMulterError(err)) {
    const message = multerErrorMessage(err.code);
    const payload: ApiResponse = {
      success: false,
      error: message,
    };
    res.status(400).json(payload);
    return;
  }

  // ── Generic Error ─────────────────────────────────────────────────────────
  if (err instanceof Error) {
    logger.error(
      { err, method: req.method, url: req.originalUrl },
      'Unhandled error',
    );
    const payload: ApiResponse = {
      success: false,
      error:
        process.env['NODE_ENV'] === 'production'
          ? 'Internal Server Error'
          : err.message,
    };
    res.status(500).json(payload);
    return;
  }

  // ── Unknown throw ─────────────────────────────────────────────────────────
  logger.error(
    { err, method: req.method, url: req.originalUrl },
    'Unknown error type thrown',
  );
  const fallback: ApiResponse = {
    success: false,
    error: 'Internal Server Error',
  };
  res.status(500).json(fallback);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MulterErrorLike {
  code: string;
  message: string;
  field?: string;
}

function isMulterError(err: unknown): err is MulterErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as Record<string, unknown>)['code'] === 'string' &&
    String((err as Record<string, unknown>)['code']).startsWith('LIMIT_')
  );
}

function multerErrorMessage(code: string): string {
  switch (code) {
    case 'LIMIT_FILE_SIZE':
      return 'File exceeds the maximum allowed size.';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded at once.';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field received.';
    case 'LIMIT_PART_COUNT':
      return 'Too many multipart parts.';
    case 'LIMIT_FIELD_KEY':
      return 'Field name is too long.';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value is too long.';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields.';
    default:
      return 'File upload error.';
  }
}
