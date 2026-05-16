/**
 * Result of a single image analysis check.
 */
export interface CheckResult {
  /** Unique name identifying the check. */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Confidence score in [0, 1]. */
  confidence: number;
  /** Human-readable detail string. */
  detail: string;
}

/**
 * Aggregate result of running all checks against one image.
 */
export interface AnalysisResult {
  /** Individual check results. */
  checks: CheckResult[];
  /** True only when every check passed. */
  overallPassed: boolean;
  /** Weighted average confidence across all weighted checks. */
  overallConfidence: number;
  /** Human-readable list of what failed. */
  issuesSummary: string[];
  /** Checks where confidence < 0.3. */
  criticalFailures: string[];
  /** SHA-256 hex digest of the raw file bytes. */
  imageHash: string;
}
