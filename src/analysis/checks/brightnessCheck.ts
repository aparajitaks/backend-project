import sharp from 'sharp';
import type { CheckResult } from '../types';

const TOO_DARK = 40;
const TOO_BRIGHT = 220;

/**
 * Evaluates perceived brightness using the ITU-R BT.601 luma formula:
 *   Y = 0.299R + 0.587G + 0.114B
 *
 * Fails if brightness < 40 (dark) or > 220 (overexposed).
 * Confidence is 1.0 within the acceptable range and linearly interpolated outside it.
 */
export async function checkBrightness(imagePath: string): Promise<CheckResult> {
  const stats = await sharp(imagePath).stats();
  const ch = stats.channels;

  let r: number;
  let g: number;
  let b: number;

  if (ch.length >= 3) {
    r = ch[0]?.mean ?? 0;
    g = ch[1]?.mean ?? 0;
    b = ch[2]?.mean ?? 0;
  } else {
    // Grayscale image
    const gray = ch[0]?.mean ?? 0;
    r = gray;
    g = gray;
    b = gray;
  }

  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  const brightnessInt = Math.round(brightness);

  let passed = true;
  let reason = 'acceptable';
  let confidence = 1.0;

  if (brightness < TOO_DARK) {
    passed = false;
    reason = 'too dark';
    // Linear: 0 at brightness=0, 1 at brightness=TOO_DARK
    confidence = brightness / TOO_DARK;
  } else if (brightness > TOO_BRIGHT) {
    passed = false;
    reason = 'overexposed';
    // Linear: 1 at brightness=TOO_BRIGHT, 0 at brightness=255
    confidence = 1 - (brightness - TOO_BRIGHT) / (255 - TOO_BRIGHT);
  }

  return {
    name: 'brightnessCheck',
    passed,
    confidence: Math.max(0, Math.min(1, confidence)),
    detail: `Brightness: ${brightnessInt} — ${reason}`,
  };
}
