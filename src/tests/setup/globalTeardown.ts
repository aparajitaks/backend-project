import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { closeWorker, closeQueue } from '../../queue/index';
import { closeRedis } from '../../queue/redisClient';

export default async function globalTeardown() {
  console.log('\nTearing down test environment...');

  // 1. Close BullMQ worker, queue, and Redis client
  try {
    await closeWorker();
  } catch (error) {
    console.error('Failed to close worker in globalTeardown:', error);
  }

  try {
    await closeQueue();
  } catch (error) {
    console.error('Failed to close queue in globalTeardown:', error);
  }

  try {
    await closeRedis();
  } catch (error) {
    console.error('Failed to close redis in globalTeardown:', error);
  }

  // 2. Disconnect Prisma
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env['TEST_DATABASE_URL'] } },
  });

  try {
    // 3. Delete all rows in order
    console.log('Cleaning up test database...');
    await prisma.jobResult.deleteMany({});
    await prisma.job.deleteMany({});
  } catch (error) {
    // Silence error for unit-only runs
    const isUnitOnly = process.argv.some(arg => arg.includes('src/tests/unit'));
    if (!isUnitOnly) {
      console.error('Failed to cleanup database:', error);
    }
  } finally {
    await prisma.$disconnect();
  }

  // 4. Remove uploads-test directory and contents
  const uploadDir = process.env['UPLOAD_DIR'] || './uploads-test';
  const fullPath = path.resolve(uploadDir);
  if (fs.existsSync(fullPath)) {
    console.log(`Removing test upload directory: ${fullPath}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}
