import { checkScreenshot } from '../../analysis/checks/screenshotDetection';
import sharp from 'sharp';

jest.mock('sharp');
// Mock dynamic import of exifr
jest.mock('exifr', () => ({
  parse: jest.fn().mockResolvedValue({ Software: 'Generic' }),
}));

describe('screenshotDetection unit tests', () => {
  const mockSharp = sharp as unknown as jest.Mock;

  it('does not flag a normal photo', async () => {
    const width = 100;
    const height = 100;
    const data = Buffer.alloc(width * height, 128);
    // Add noise so stdDev > 5
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 255;
    }

    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data,
        info: { width, height },
      }),
    });

    const result = await checkScreenshot('fake-path.jpg');
    expect(result.passed).toBeTrue();
    expect(result.detail).toBe('No screenshot indicators detected');
  });

  it('detail is a string', async () => {
    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.alloc(100, 128),
        info: { width: 10, height: 10 },
      }),
    });

    const result = await checkScreenshot('fake-path.jpg');
    expect(typeof result.detail).toBe('string');
  });

  it('confidence is between 0 and 1', async () => {
    const result = await checkScreenshot('fake-path.jpg');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('passed is a boolean', async () => {
    const result = await checkScreenshot('fake-path.jpg');
    expect(typeof result.passed).toBe('boolean');
  });
});
