import pino from 'pino';
import { env } from './env';

/**
 * Shared Pino logger instance used across the entire codebase.
 *
 * In development, output is prettified for readability.
 * In production, JSON lines are emitted at `info` level for structured log ingestion.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});
