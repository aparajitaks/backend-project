import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { env } from '../../config/env';
import type { CheckResult } from '../types';

/**
 * UK-style number plate pattern: 2 letters, 1-2 digits, 1-2 letters, 4 digits.
 * e.g. AB12CD3456 — adjust as needed for your locale.
 */
const NUMBER_PLATE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;

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
  const metadata = await sharp(imagePath).metadata();
  const fullWidth  = metadata.width  ?? 0;
  const fullHeight = metadata.height ?? 0;

  const cropLeft   = Math.floor(fullWidth  * 0.2);
  const cropTop    = Math.floor(fullHeight * 0.2);
  const cropWidth  = Math.floor(fullWidth  * 0.6);
  const cropHeight = Math.floor(fullHeight * 0.6);

  const croppedBuffer = await sharp(imagePath)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // ── 2. OCR with timeout ───────────────────────────────────────────────────
  const timeoutMs = env.OCR_TIMEOUT_MS;

  type OcrOutcome =
    | { timedOut: true }
    | { timedOut: false; text: string };

  const ocrPromise: Promise<OcrOutcome> = (async (): Promise<OcrOutcome> => {
    const worker = await Tesseract.createWorker('eng');
    try {
      await worker.setParameters({
        // PSM 7 — treat image as a single text line
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      });
      const { data } = await worker.recognize(croppedBuffer);
      return { timedOut: false, text: data.text.trim().replace(/\s+/g, '') };
    } finally {
      await worker.terminate();
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
