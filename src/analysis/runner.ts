import { checkBlur }            from './checks/blurDetection';
import { checkBrightness }      from './checks/brightnessCheck';
import { checkDimension }       from './checks/dimensionCheck';
import { checkScreenshot }      from './checks/screenshotDetection';
import { checkNumberPlate }     from './checks/numberPlateOCR';
import { checkDuplicate }       from './checks/duplicateDetection';
import type { CheckResult, AnalysisResult } from './types';

// ---------------------------------------------------------------------------
// Weighted confidence weights (must sum to 1.0)
// duplicate detection is not weighted — it only affects overallPassed
// ---------------------------------------------------------------------------
const WEIGHTS: Record<string, number> = {
  blurDetection:       0.25,
  brightnessCheck:     0.20,
  dimensionCheck:      0.15,
  screenshotDetection: 0.15,
  numberPlateOCR:      0.25,
};

/**
 * Converts a PromiseSettledResult into a CheckResult, generating an error
 * CheckResult if the promise was rejected.
 */
function settle(
  result: PromiseSettledResult<CheckResult>,
  name: string,
): CheckResult {
  if (result.status === 'fulfilled') return result.value;
  const msg =
    result.reason instanceof Error
      ? result.reason.message
      : String(result.reason);
  return { name, passed: false, confidence: 0, detail: `Check error: ${msg}` };
}

/**
 * Runs all image analysis checks and computes aggregate scores.
 *
 * Execution order:
 *  1. blur + brightness + dimension + screenshot run in parallel (Promise.allSettled)
 *  2. numberPlateOCR runs sequentially (heavy Tesseract worker)
 *  3. duplicateDetection runs sequentially (DB query needs file hash)
 *
 * Weighted confidence uses only the five non-duplicate checks.
 * overallPassed requires every check (including duplicate) to pass.
 */
export async function runAllChecks(
  imagePath: string,
  jobId: string,
): Promise<AnalysisResult> {
  // ── Phase 1: parallel checks ──────────────────────────────────────────────
  const [blurSettled, brightnessSettled, dimensionSettled, screenshotSettled] =
    await Promise.allSettled([
      checkBlur(imagePath),
      checkBrightness(imagePath),
      checkDimension(imagePath),
      checkScreenshot(imagePath),
    ]);

  const blur       = settle(blurSettled,       'blurDetection');
  const brightness = settle(brightnessSettled, 'brightnessCheck');
  const dimension  = settle(dimensionSettled,  'dimensionCheck');
  const screenshot = settle(screenshotSettled, 'screenshotDetection');

  // ── Phase 2: sequential checks ────────────────────────────────────────────
  let ocr: CheckResult;
  try {
    ocr = await checkNumberPlate(imagePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ocr = { name: 'numberPlateOCR', passed: false, confidence: 0, detail: `Check error: ${msg}` };
  }

  let imageHash = '';
  let duplicate: CheckResult;
  try {
    const dupResult = await checkDuplicate(imagePath, jobId);
    duplicate = dupResult.checkResult;
    imageHash = dupResult.imageHash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    duplicate = { name: 'duplicateDetection', passed: false, confidence: 0, detail: `Check error: ${msg}` };
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const weightedChecks: CheckResult[] = [blur, brightness, dimension, screenshot, ocr];
  const allChecks: CheckResult[]      = [...weightedChecks, duplicate];

  const overallConfidence = weightedChecks.reduce(
    (sum, c) => sum + c.confidence * (WEIGHTS[c.name] ?? 0),
    0,
  );

  const overallPassed = allChecks.every((c) => c.passed);

  return {
    checks: allChecks,
    overallPassed,
    overallConfidence,
    imageHash,
  };
}
