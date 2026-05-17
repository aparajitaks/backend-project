import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export default async function globalSetup() {
  // 1. Load test environment variables
  dotenv.config({ path: '.env.test' });

  console.log('\nSetting up test environment...');

  // 2. Point DATABASE_URL to TEST_DATABASE_URL for the migration tool
  if (!process.env['TEST_DATABASE_URL']) {
    throw new Error('TEST_DATABASE_URL not set in .env.test');
  }
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];

  // 3. Run prisma db push to ensure schema is pushed to test DB
  try {
    console.log('Pushing schema to test database...');
    const env = { 
      ...process.env, 
      PATH: `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin` 
    };
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', env });
  } catch (error) {
    console.warn('⚠️  Migration failed. Integration/E2E tests will fail if the DB is unreachable.');
    
    // If we're only running unit tests, we can ignore this. 
    // Otherwise, we throw to prevent false positives in integration tests.
    const isUnitOnly = process.argv.some(arg => arg.includes('src/tests/unit'));
    if (!isUnitOnly) {
      throw error;
    }
  }

  // 4. Create uploads-test directory
  const uploadDir = process.env['UPLOAD_DIR'] || './uploads-test';
  const fullPath = path.resolve(uploadDir);
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating test upload directory: ${fullPath}`);
    fs.mkdirSync(fullPath, { recursive: true });
  }
}
