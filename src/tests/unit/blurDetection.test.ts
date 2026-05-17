import { checkBlur } from '../../analysis/checks/blurDetection';
import sharp from 'sharp';

jest.mock('sharp');

describe('blurDetection unit tests', () => {
  const mockSharp = sharp as unknown as jest.Mock;

  it('returns passed=true for a sharp image (variance > 80)', async () => {
    // Generate a buffer that yields high variance
    const width = 10;
    const height = 10;
    const data = Buffer.alloc(width * height, 0);
    // Create a checkerboard pattern for high variance
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 2 === 0 ? 255 : 0;
    }

    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data,
        info: { width, height },
      }),
    });

    const result = await checkBlur('fake-path.jpg');
    expect(result.passed).toBeTrue();
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('returns passed=false for a blurry image (variance < 80)', async () => {
    const width = 10;
    const height = 10;
    const data = Buffer.alloc(width * height, 128); // Uniform color = 0 variance

    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data,
        info: { width, height },
      }),
    });

    const result = await checkBlur('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.confidence).toBe(0);
  });

  it('confidence is between 0 and 1', async () => {
    const width = 10;
    const height = 10;
    const data = Buffer.alloc(width * height, 128);

    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data,
        info: { width, height },
      }),
    });

    const result = await checkBlur('fake-path.jpg');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('detail string contains the word "variance"', async () => {
    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.alloc(100, 128),
        info: { width: 10, height: 10 },
      }),
    });

    const result = await checkBlur('fake-path.jpg');
    expect(result.detail).toContain('variance');
  });

  it('does not throw on a valid image path', async () => {
    mockSharp.mockReturnValue({
      greyscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.alloc(100, 128),
        info: { width: 10, height: 10 },
      }),
    });

    await expect(checkBlur('valid-path.jpg')).resolves.not.toThrow();
  });
});
