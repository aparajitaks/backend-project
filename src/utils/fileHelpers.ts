import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import type { StoredFile } from '../types';

// ---------------------------------------------------------------------------
// Collision-resistant ID generation
// ---------------------------------------------------------------------------

/**
 * Generates a URL-safe, collision-resistant 24-character random ID.
 * Uses only Node's built-in `crypto` module — no external dependency needed.
 */
function generateId(): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = require('crypto').randomBytes(24) as Buffer;
  return Array.from(bytes)
    .map((b) => chars[b % chars.length] as string)
    .join('');
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Ensures that the upload directory (and any intermediate directories) exists.
 * Uses `fs.mkdirSync` with `recursive: true` so it is safe to call repeatedly.
 *
 * @throws {Error} If the directory cannot be created due to permission issues.
 */
export function ensureUploadDirExists(): void {
  const dir = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolves the absolute path of the upload directory.
 */
export function resolveUploadDir(): string {
  return path.resolve(env.UPLOAD_DIR);
}

/**
 * Derives the file extension from a MIME type string.
 *
 * Supported MIME types: image/jpeg, image/png, image/webp.
 * Returns `.jpg` for jpeg (most common convention).
 * Returns an empty string for unrecognised types.
 */
export function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[mimeType] ?? '';
}

/**
 * Builds a stored filename using the pattern `<id>-<timestamp>.<ext>`.
 *
 * @param mimeType - MIME type of the uploaded file.
 * @returns A collision-resistant filename string.
 */
export function buildStoredFilename(mimeType: string): string {
  const id = generateId();
  const ts = Date.now();
  const ext = extensionFromMime(mimeType);
  return `${id}-${ts}${ext}`;
}

/**
 * Constructs the full `StoredFile` descriptor for a successfully saved file.
 *
 * @param originalname   - Original filename reported by the client.
 * @param storedFilename - Filename under which the file was persisted.
 * @param mimeType       - MIME type of the file.
 * @param fileSize       - File size in bytes.
 * @returns              A `StoredFile` object ready to persist to the database.
 */
export function buildStoredFile(
  originalname: string,
  storedFilename: string,
  mimeType: string,
  fileSize: number,
): StoredFile {
  const storedPath = path.join(resolveUploadDir(), storedFilename);
  return {
    originalFilename: originalname,
    storedFilename,
    storedPath,
    mimeType,
    fileSize,
  };
}
