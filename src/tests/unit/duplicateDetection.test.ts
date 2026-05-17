import { checkDuplicate } from '../../analysis/checks/duplicateDetection';
import { prisma } from '../../config/db';
import fs from 'fs';
import crypto from 'crypto';

jest.mock('../../config/db', () => ({
  prisma: {
    job: {
      findFirst: jest.fn(),
    },
  },
}));
jest.mock('fs');

describe('duplicateDetection unit tests', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.readFileSync.mockReturnValue(Buffer.from('fake-image-bytes'));
  });

  it('returns isDuplicate=false when no matching hash in DB', async () => {
    (mockPrisma.job.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await checkDuplicate('fake-path.jpg', 'current-job-id');
    expect(result.checkResult.passed).toBeTrue();
    expect(result.checkResult.detail).toBe('No duplicate found');
  });

  it('returns isDuplicate=true when a completed job with same hash exists', async () => {
    (mockPrisma.job.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-job-id' });

    const result = await checkDuplicate('fake-path.jpg', 'current-job-id');
    expect(result.checkResult.passed).toBeFalse();
    expect(result.checkResult.detail).toContain('existing-job-id');
  });

  it('does not flag itself as a duplicate', async () => {
    await checkDuplicate('fake-path.jpg', 'current-job-id');
    expect(mockPrisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'current-job-id' },
        }),
      })
    );
  });

  it('hash is a 64-character hex string (SHA-256)', async () => {
    const result = await checkDuplicate('fake-path.jpg', 'current-job-id');
    expect(result.imageHash).toHaveLength(64);
    expect(result.imageHash).toMatch(/^[0-9a-f]+$/);
  });
});
