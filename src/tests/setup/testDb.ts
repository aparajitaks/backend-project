import { PrismaClient } from '@prisma/client';

/**
 * Prisma client instance configured for the test database.
 */
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env['TEST_DATABASE_URL'],
    },
  },
});
