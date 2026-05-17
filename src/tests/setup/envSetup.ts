import dotenv from 'dotenv';

// Load .env.test specifically for all test workers
dotenv.config({ path: '.env.test' });

// Ensure DATABASE_URL used by Prisma matches TEST_DATABASE_URL
if (process.env['TEST_DATABASE_URL']) {
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
}
