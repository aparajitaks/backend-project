import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { testPrisma } from './testDb';
import type { Application } from 'express';

/**
 * Truncates Job and JobResult tables in correct FK order.
 */
export async function cleanDb() {
  await testPrisma.jobResult.deleteMany({});
  await testPrisma.job.deleteMany({});
}

/**
 * Inserts a Job row with sane defaults.
 */
export async function createTestJob(overrides = {}) {
  return await testPrisma.job.create({
    data: {
      originalFilename: 'test.jpg',
      storedFilename: `test-${Date.now()}.jpg`,
      storedPath: path.join(process.env['UPLOAD_DIR'] || './uploads-test', 'test.jpg'),
      mimeType: 'image/jpeg',
      fileSize: 1024,
      status: 'pending',
      ...overrides,
    },
  });
}

/**
 * Uploads a test image using supertest.
 */
export async function uploadTestImage(app: Application, imageBuffer: Buffer, filename = 'test.jpg') {
  return await request(app)
    .post('/api/upload')
    .attach('image', imageBuffer, filename);
}

/**
 * Polls GET /api/jobs/:id/status until status matches target or timeout occurs.
 */
export async function waitForStatus(jobId: string, targetStatus: string, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await testPrisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (res?.status === targetStatus) {
      return res;
    }
    
    if (res?.status === 'failed' && targetStatus !== 'failed') {
      throw new Error(`Job failed unexpectedly: ${jobId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for status ${targetStatus} for job ${jobId}`);
}

/**
 * Writes a buffer to the test uploads directory.
 */
export function writeFixtureToFile(buffer: Buffer, filename: string): string {
  const uploadDir = process.env['UPLOAD_DIR'] || './uploads-test';
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
