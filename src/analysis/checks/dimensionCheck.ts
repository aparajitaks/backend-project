import sharp from 'sharp';
import { env } from '../../config/env';
import type { CheckResult } from '../types';

/**
 * Validates image dimensions and aspect ratio.
 *
 * Confidence rules:
 *  - both dimensions ≥ 600 → 1.0
 *  - both ≥ MIN but either < 600 → 0.6
 *  - either < MIN → 0.0 (fail)
 *
 * Aspect ratio flag: width:height outside 1:3 – 3:1.
 */
export async function checkDimension(imagePath: string): Promise<CheckResult> {
  const metadata = await sharp(imagePath).metadata();
  const width  = metadata.width  ?? 0;
  const height = metadata.height ?? 0;

  const MIN = env.MIN_IMAGE_DIMENSION;
  const issues: string[] = [];
  let passed = true;

  // --- Size confidence ---
  let confidence: number;
  if (width < MIN || height < MIN) {
    passed = false;
    confidence = 0.0;
    issues.push(`Image too small: ${width}x${height} (min ${MIN}px per side)`);
  } else if (width < 600 || height < 600) {
    confidence = 0.6;
    issues.push(`Image is small: ${width}x${height}`);
  } else {
    confidence = 1.0;
  }

  // --- Aspect ratio check ---
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio > 3 || ratio < 1 / 3) {
      passed = false;
      issues.push(`Unusual aspect ratio: ${ratio.toFixed(2)}:1 (allowed 1:3 – 3:1)`);
    }
  }

  const detail =
    issues.length > 0
      ? issues.join('; ')
      : `Dimensions OK: ${width}x${height}`;

  return {
    name: 'dimensionCheck',
    passed,
    confidence,
    detail,
  };
}
