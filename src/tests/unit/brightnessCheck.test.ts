import { checkBrightness } from '../../analysis/checks/brightnessCheck';
import sharp from 'sharp';

jest.mock('sharp');

describe('brightnessCheck unit tests', () => {
  const mockSharp = sharp as unknown as jest.Mock;

  it('passes for a mid-brightness image (~128)', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 128 }, { mean: 128 }, { mean: 128 }],
      }),
    });

    const result = await checkBrightness('fake-path.jpg');
    expect(result.passed).toBeTrue();
    expect(result.detail).toContain('acceptable');
    expect(result.confidence).toBe(1.0);
  });

  it('fails for a dark image (brightness < 40)', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 10 }, { mean: 10 }, { mean: 10 }],
      }),
    });

    const result = await checkBrightness('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.detail).toContain('too dark');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('fails for an overexposed image (brightness > 220)', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 240 }, { mean: 240 }, { mean: 240 }],
      }),
    });

    const result = await checkBrightness('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.detail).toContain('overexposed');
  });

  it('confidence = 1.0 for brightness exactly 128', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 128 }, { mean: 128 }, { mean: 128 }],
      }),
    });

    const result = await checkBrightness('fake-path.jpg');
    expect(result.confidence).toBe(1.0);
  });

  it('confidence < 0.5 for brightness = 10', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 10 }, { mean: 10 }, { mean: 10 }],
      }),
    });

    const result = await checkBrightness('fake-path.jpg');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('detail mentions "dark" or "overexposed" when failing', async () => {
    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 10 }, { mean: 10 }, { mean: 10 }],
      }),
    });
    const resultDark = await checkBrightness('dark.jpg');
    expect(resultDark.detail).toContain('dark');

    mockSharp.mockReturnValue({
      stats: jest.fn().mockResolvedValue({
        channels: [{ mean: 250 }, { mean: 250 }, { mean: 250 }],
      }),
    });
    const resultBright = await checkBrightness('bright.jpg');
    expect(resultBright.detail).toContain('overexposed');
  });
});
