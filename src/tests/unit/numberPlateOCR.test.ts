import { checkNumberPlate } from '../../analysis/checks/numberPlateOCR';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { env } from '../../config/env';

jest.mock('sharp');
jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
  PSM: { SINGLE_LINE: '7' },
}));

describe('numberPlateOCR unit tests', () => {
  const mockSharp = sharp as unknown as jest.Mock;
  const mockTesseract = Tesseract as jest.Mocked<typeof Tesseract>;

  // Create a persistent mock worker that we can re-configure per test
  const mockWorker = {
    setParameters: jest.fn().mockResolvedValue(undefined),
    recognize: jest.fn(),
    terminate: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(() => {
    (mockTesseract.createWorker as jest.Mock).mockResolvedValue(mockWorker);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 1000, height: 1000 }),
      extract: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-buffer')),
    });
  });

  it('returns passed=false for a plain gray image (no text)', async () => {
    mockWorker.recognize.mockResolvedValue({ data: { text: '' } });

    const result = await checkNumberPlate('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.detail).toContain('No text detected');
    expect(result.confidence).toBe(0.1);
  });

  it('returns passed=true for a valid number plate', async () => {
    mockWorker.recognize.mockResolvedValue({ data: { text: 'AB12CD3456' } });

    const result = await checkNumberPlate('fake-path.jpg');
    expect(result.passed).toBeTrue();
    expect(result.confidence).toBe(0.95);
    expect(result.detail).toContain('Valid number plate detected');
  });

  it('returns passed=false for text that does not match plate format', async () => {
    mockWorker.recognize.mockResolvedValue({ data: { text: 'HELLO WORLD' } });

    const result = await checkNumberPlate('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.confidence).toBe(0.4);
    expect(result.detail).toContain('does not match plate format');
  });

  it('handles timeout gracefully', async () => {
    // Force a long-running OCR
    let timeoutHandle: NodeJS.Timeout;
    mockWorker.recognize.mockImplementation(() => {
      return new Promise((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ data: { text: 'LATE' } });
        }, 1000);
      });
    });

    const originalTimeout = env.OCR_TIMEOUT_MS;
    // Set timeout to be shorter than the recognize implementation
    (env as any).OCR_TIMEOUT_MS = 50;

    const result = await checkNumberPlate('fake-path.jpg');
    
    expect(result.passed).toBeFalse();
    expect(result.confidence).toBe(0.0);
    expect(result.detail).toContain('timed out');

    // Cleanup
    env.OCR_TIMEOUT_MS = originalTimeout;
    if (timeoutHandle!) clearTimeout(timeoutHandle);
  });
});
