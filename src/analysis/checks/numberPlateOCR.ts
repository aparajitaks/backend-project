import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { env } from '../../config/env';
import type { CheckResult } from '../types';
import { AppError } from '../../utils/AppError';

/**
 * UK-style number plate pattern: 2 letters, 1-2 digits, 1-2 letters, 4 digits.
 * e.g. AB12CD3456 — adjust as needed for your locale.
 */
const NUMBER_PLATE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;

let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Crops the centre 60% of the image and runs Tesseract OCR (PSM 7 — single line)
 * to detect a vehicle number plate.
 *
 * Confidence levels:
 *  - Timeout           → 0.0
 *  - No text detected  → 0.1
 *  - Text but invalid  → 0.4
 *  - Valid plate found → 0.95
 */
export async function checkNumberPlate(imagePath: string): Promise<CheckResult> {
  // ── 1. Crop centre 60% ────────────────────────────────────────────────────
  let metadata: sharp.Metadata;
  let croppedBuffer: Buffer;

  try {
    metadata = await sharp(imagePath).metadata();
    const fullWidth  = metadata.width  ?? 0;
    const fullHeight = metadata.height ?? 0;

    const cropLeft   = Math.floor(fullWidth  * 0.2);
    const cropTop    = Math.floor(fullHeight * 0.2);
    const cropWidth  = Math.floor(fullWidth  * 0.6);
    const cropHeight = Math.floor(fullHeight * 0.6);

    croppedBuffer = await sharp(imagePath)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('Image processing failed: ' + msg, 422);
  }

  // ── 2. OCR with timeout ───────────────────────────────────────────────────
  const timeoutMs = env.OCR_TIMEOUT_MS;

  type OcrOutcome =
    | { timedOut: true }
    | { timedOut: false; text: string };

  const ocrPromise: Promise<OcrOutcome> = (async (): Promise<OcrOutcome> => {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(croppedBuffer);
      return { timedOut: false, text: data.text.trim().replace(/\s+/g, '') };
    } catch {
      // If Tesseract fails, we consider it a timeout/failure rather than breaking the pipeline
      return { timedOut: true };
    }
  })();

  const timeoutPromise: Promise<OcrOutcome> = new Promise((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), timeoutMs),
  );

  const outcome = await Promise.race([ocrPromise, timeoutPromise]);

  // ── 3. Classify result ────────────────────────────────────────────────────
  if (outcome.timedOut) {
    return {
      name: 'numberPlateOCR',
      passed: false,
      confidence: 0.0,
      detail: `OCR timed out after ${timeoutMs}ms`,
    };
  }

  const { text } = outcome;

  if (!text || text.length === 0) {
    return {
      name: 'numberPlateOCR',
      passed: false,
      confidence: 0.1,
      detail: 'No text detected in centre crop',
    };
  }

  const normalised = text.toUpperCase();
  if (!NUMBER_PLATE_REGEX.test(normalised)) {
    return {
      name: 'numberPlateOCR',
      passed: false,
      confidence: 0.4,
      detail: `Text detected but does not match plate format: "${normalised}"`,
    };
  }

  return {
    name: 'numberPlateOCR',
    passed: true,
    confidence: 0.95,
    detail: `Valid number plate detected: "${normalised}"`,
  };
}
