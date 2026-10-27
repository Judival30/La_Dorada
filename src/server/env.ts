import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default('ladorada-private'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  APP_URL: z.string().url(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  ADAPTERS_MODE: z.enum(['mock']).default('mock'),
});

export type Env = z.infer<typeof envSchema>;

/** Pure parser: throws ZodError when the raw variables are invalid. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  return envSchema.parse(raw);
}

let cached: Env | undefined;

/** Parses `process.env` on first call and caches the result. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Lazily evaluated validated env. Validation runs on first property access,
 * not at import time, so importing this module (e.g. in unit tests) never
 * throws when variables are missing.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, prop) => getEnv()[prop as keyof Env],
  has: (_target, prop) => prop in getEnv(),
  ownKeys: () => Reflect.ownKeys(getEnv()),
  getOwnPropertyDescriptor: (_target, prop) =>
    Object.getOwnPropertyDescriptor(getEnv(), prop),
});
