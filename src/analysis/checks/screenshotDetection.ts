import sharp from 'sharp';
import type { CheckResult } from '../types';
import { AppError } from '../../utils/AppError';

const BORDER_PX = 10;
const SCREENSHOT_SOFTWARE = ['snip', 'screenshot', 'grab'];

/** Standard aspect ratios that may indicate a screenshot. */
const SCREENSHOT_RATIOS = [16 / 9, 16 / 10];
const RATIO_TOLERANCE = 0.02;

/**
 * Detects whether an image is likely a screenshot using three heuristics:
 *
 * H1 — Border uniformity: sample the 10px border band on all four sides.
 *       If std-dev of pixel values < 5 the border is suspiciously uniform.
 *
 * H2 — EXIF software tag: if the `Software` tag contains "Snip", "Screenshot",
 *       or "Grab" (case-insensitive), flag as screenshot.
 *
 * H3 — Aspect ratio + no GPS: if the image is exactly 16:9 or 16:10
 *       AND has no GPS EXIF data, flag.
 *
 * passed = false when 2 or more heuristics fire.
 */
export async function checkScreenshot(imagePath: string): Promise<CheckResult> {
  const firedHeuristics: string[] = [];

  // ── H1: Border uniformity ─────────────────────────────────────────────────
  try {
    const { data, info } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const borderPixels: number[] = [];

    for (let x = 0; x < width; x++) {
      for (let row = 0; row < BORDER_PX; row++) {
        borderPixels.push(data[row * width + x] ?? 0);                          // top
        borderPixels.push(data[(height - 1 - row) * width + x] ?? 0);          // bottom
      }
    }
    for (let y = BORDER_PX; y < height - BORDER_PX; y++) {
      for (let col = 0; col < BORDER_PX; col++) {
        borderPixels.push(data[y * width + col] ?? 0);                          // left
        borderPixels.push(data[y * width + (width - 1 - col)] ?? 0);           // right
      }
    }

    const n = borderPixels.length;
    if (n > 0) {
      const mean = borderPixels.reduce((a, b) => a + b, 0) / n;
      const variance =
        borderPixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);

      if (stdDev < 5) {
        firedHeuristics.push(`H1: uniform border (std-dev=${stdDev.toFixed(2)})`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError('Image processing failed: ' + msg, 422);
  }

  // ── H2 & H3: EXIF parsing (dynamic import for ESM-only exifr) ────────────
  try {
    // exifr is ESM-only; use dynamic import in CommonJS context
    const exifr = (await import('exifr')).default;
    const exif = await exifr.parse(imagePath, {
      tiff: true,
      gps: true,
    }) as Record<string, unknown> | null;

    if (exif) {
      // H2 — Software tag
      const software = String(exif['Software'] ?? '').toLowerCase();
      if (SCREENSHOT_SOFTWARE.some((kw) => software.includes(kw))) {
        firedHeuristics.push(`H2: software tag "${exif['Software'] as string}"`);
      }

      // H3 — Common screen aspect ratio + no GPS
      const imgWidth  = typeof exif['ImageWidth']  === 'number' ? exif['ImageWidth']  : 0;
      const imgHeight = typeof exif['ImageHeight'] === 'number' ? exif['ImageHeight'] : 0;
      const hasGps = Boolean(exif['latitude'] ?? exif['GPSLatitude']);

      if (imgWidth > 0 && imgHeight > 0 && !hasGps) {
        const ratio = imgWidth / imgHeight;
        const isScreenRatio = SCREENSHOT_RATIOS.some(
          (r) => Math.abs(ratio - r) < RATIO_TOLERANCE,
        );
        if (isScreenRatio) {
          firedHeuristics.push(
            `H3: screen ratio ${(imgWidth / imgHeight).toFixed(3)} without GPS`,
          );
        }
      }
    }
  } catch {
    // EXIF unavailable — skip H2 and H3
  }

  const passed = firedHeuristics.length < 2;
  const confidence = passed
    ? firedHeuristics.length === 0 ? 1.0 : 0.6
    : 0.1;

  const detail =
    firedHeuristics.length === 0
      ? 'No screenshot indicators detected'
      : `Screenshot indicators fired: ${firedHeuristics.join(', ')}`;

  return {
    name: 'screenshotDetection',
    passed,
    confidence,
    detail,
  };
}
