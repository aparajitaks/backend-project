import sharp from 'sharp';
import type { CheckResult } from '../types';
import { AppError } from '../../utils/AppError';

const THRESHOLD = 80;

/**
 * Detects image blur by computing the variance of the Laplacian operator
 * applied to the grayscale pixel buffer.
 *
 * A blurry image has low high-frequency content, yielding a low Laplacian variance.
 * Threshold: 80. Confidence = Math.min(variance / 200, 1).
 */
export async function checkBlur(imagePath: string): Promise<CheckResult> {
  let data: Buffer;
  let info: sharp.OutputInfo;
  try {
    const result = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = result.data;
    info = result.info;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('Image processing failed: ' + msg, 422);
  }

  const { width, height } = info;

  // Accumulate Laplacian values (skip 1-pixel border to avoid out-of-bounds)
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const center = data[idx] ?? 0;
      const left   = data[idx - 1] ?? 0;
      const right  = data[idx + 1] ?? 0;
      const top    = data[idx - width] ?? 0;
      const bottom = data[idx + width] ?? 0;

      const laplacian = -4 * center + left + right + top + bottom;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  // Variance = E[X²] - (E[X])²
  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? sumSq / count - mean * mean : 0;

  const passed = variance >= THRESHOLD;
  const confidence = Math.min(variance / 200, 1);

  return {
    name: 'blurDetection',
    passed,
    confidence,
    detail: `Laplacian variance: ${variance.toFixed(2)} (threshold: 80)`,
  };
}
