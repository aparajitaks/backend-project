import { runAllChecks } from '../../analysis/runner';
import * as blurCheck from '../../analysis/checks/blurDetection';
import * as brightnessCheck from '../../analysis/checks/brightnessCheck';
import * as dimensionCheck from '../../analysis/checks/dimensionCheck';
import * as screenshotCheck from '../../analysis/checks/screenshotDetection';
import * as ocrCheck from '../../analysis/checks/numberPlateOCR';
import * as duplicateCheck from '../../analysis/checks/duplicateDetection';

jest.mock('../../analysis/checks/blurDetection');
jest.mock('../../analysis/checks/brightnessCheck');
jest.mock('../../analysis/checks/dimensionCheck');
jest.mock('../../analysis/checks/screenshotDetection');
jest.mock('../../analysis/checks/numberPlateOCR');
jest.mock('../../analysis/checks/duplicateDetection');
jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn() },
}));

describe('runner unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (blurCheck.checkBlur as jest.Mock).mockResolvedValue({ name: 'blurDetection', passed: true, confidence: 1.0, detail: 'OK' });
    (brightnessCheck.checkBrightness as jest.Mock).mockResolvedValue({ name: 'brightnessCheck', passed: true, confidence: 1.0, detail: 'OK' });
    (dimensionCheck.checkDimension as jest.Mock).mockResolvedValue({ name: 'dimensionCheck', passed: true, confidence: 1.0, detail: 'OK' });
    (screenshotCheck.checkScreenshot as jest.Mock).mockResolvedValue({ name: 'screenshotDetection', passed: true, confidence: 1.0, detail: 'OK' });
    (ocrCheck.checkNumberPlate as jest.Mock).mockResolvedValue({ name: 'numberPlateOCR', passed: true, confidence: 1.0, detail: 'OK' });
    (duplicateCheck.checkDuplicate as jest.Mock).mockResolvedValue({ 
      checkResult: { name: 'duplicateDetection', passed: true, confidence: 1.0, detail: 'OK' },
      imageHash: 'fake-hash'
    });
  });

  it('returns an AnalysisResult with a checks array of length 6', async () => {
    const result = await runAllChecks('fake-path', 'job-id');
    expect(result.checks).toHaveLength(6);
  });

  it('overallConfidence is between 0 and 1', async () => {
    const result = await runAllChecks('fake-path', 'job-id');
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
  });

  it('overallPassed is a boolean', async () => {
    const result = await runAllChecks('fake-path', 'job-id');
    expect(typeof result.overallPassed).toBe('boolean');
  });

  it('issuesSummary is an array of strings', async () => {
    const result = await runAllChecks('fake-path', 'job-id');
    expect(Array.isArray(result.issuesSummary)).toBe(true);
  });

  it('criticalFailures is an array', async () => {
    const result = await runAllChecks('fake-path', 'job-id');
    expect(Array.isArray(result.criticalFailures)).toBe(true);
  });

  it('a blurry dark image has overallPassed = false', async () => {
    (blurCheck.checkBlur as jest.Mock).mockResolvedValue({ name: 'blurDetection', passed: false, confidence: 0.1, detail: 'Blurry' });
    (brightnessCheck.checkBrightness as jest.Mock).mockResolvedValue({ name: 'brightnessCheck', passed: false, confidence: 0.1, detail: 'Dark' });
    
    const result = await runAllChecks('fake-path', 'job-id');
    expect(result.overallPassed).toBeFalse();
  });

  it('individual check errors are caught — runner still returns a result', async () => {
    (blurCheck.checkBlur as jest.Mock).mockRejectedValue(new Error('Sharp crash'));
    
    const result = await runAllChecks('fake-path', 'job-id');
    expect(result.checks).toHaveLength(6);
    const blurResult = result.checks.find(c => c.name === 'blurDetection');
    expect(blurResult?.detail).toContain('Check error: Sharp crash');
    expect(blurResult?.passed).toBeFalse();
  });
});
