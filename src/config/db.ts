import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  // Prevent multiple Prisma instances during ts-node-dev hot-reloads
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client.
 *
 * In development, the instance is attached to the global object so that
 * hot-module reloads (ts-node-dev) don't create a new pool on every restart.
 * In production a fresh instance is always created.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    errorFormat: 'pretty',
  });
}

export const prisma: PrismaClient =
  env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (global.__prisma ?? (global.__prisma = createPrismaClient()));

/**
 * Gracefully disconnect Prisma.  Called during shutdown signals in server.ts.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
