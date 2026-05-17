import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  console.log('\nTearing down test environment...');

  // 1. Disconnect Prisma
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env['TEST_DATABASE_URL'] } },
  });

  try {
    // 2. Delete all rows in order
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

  // 3. Remove uploads-test directory and contents
  const uploadDir = process.env['UPLOAD_DIR'] || './uploads-test';
  const fullPath = path.resolve(uploadDir);
  if (fs.existsSync(fullPath)) {
    console.log(`Removing test upload directory: ${fullPath}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}
