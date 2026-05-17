import { checkDimension } from '../../analysis/checks/dimensionCheck';
import sharp from 'sharp';

jest.mock('sharp');

describe('dimensionCheck unit tests', () => {
  const mockSharp = sharp as unknown as jest.Mock;

  it('passes for 400x400 image', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 400, height: 400 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.passed).toBeTrue();
    expect(result.detail).toContain('400x400');
  });

  it('fails for 100x100 image', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.passed).toBeFalse();
    expect(result.confidence).toBe(0.0);
  });

  it('confidence = 1.0 for image >= 600px both sides', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.confidence).toBe(1.0);
  });

  it('confidence = 0.6 for image between 300-599px', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 400, height: 400 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.confidence).toBe(0.6);
  });

  it('confidence = 0.0 for image below 300px', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 200, height: 200 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.confidence).toBe(0.0);
  });

  it('detail mentions width and height values', async () => {
    mockSharp.mockReturnValue({
      metadata: jest.fn().mockResolvedValue({ width: 450, height: 350 }),
    });

    const result = await checkDimension('fake-path.jpg');
    expect(result.detail).toContain('450');
    expect(result.detail).toContain('350');
  });
});
