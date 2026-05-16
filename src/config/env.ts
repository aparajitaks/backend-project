import { z } from 'zod';

/**
 * Zod schema for all environment variables.
 * The process will crash with a descriptive error if any are missing or invalid.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection string')
    .startsWith('postgresql://', {
      message: 'DATABASE_URL must begin with postgresql://',
    }),
  UPLOAD_DIR: z
    .string()
    .min(1, 'UPLOAD_DIR must be a non-empty path')
    .default('./uploads'),
  MAX_FILE_SIZE_MB: z
    .string()
    .regex(/^\d+$/, 'MAX_FILE_SIZE_MB must be a numeric string')
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .default('10'),
});

/**
 * Parse and validate environment variables at module load time.
 * On failure, log the full ZodError and exit immediately so the
 * misconfiguration is obvious before the server attempts to start.
 */
function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      '❌  Invalid environment configuration:\n',
      result.error.format(),
    );
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();

// Convenience derived values
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Maximum file size in bytes, derived from MAX_FILE_SIZE_MB */
export const MAX_FILE_SIZE_BYTES = env.MAX_FILE_SIZE_MB * 1024 * 1024;
