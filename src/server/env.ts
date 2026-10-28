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
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  MAIL_DRIVER: z.enum(['smtp', 'memory']).default('smtp'),
  MAIL_FROM: z.string().min(1).default('La Dorada <no-responder@ladorada.local>'),
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
  getOwnPropertyDescriptor: (_target, prop) => Object.getOwnPropertyDescriptor(getEnv(), prop),
});

const driverSchema = envSchema.pick({ STORAGE_DRIVER: true, MAIL_DRIVER: true });

/**
 * Validated adapter drivers only (read fresh from `process.env`, so it does not
 * require the S3/SMTP variables). Memory drivers are refused in production.
 */
export function getDriverEnv(raw: Record<string, string | undefined> = process.env) {
  const drivers = driverSchema.parse(raw);
  if (
    raw.NODE_ENV === 'production' &&
    (drivers.STORAGE_DRIVER === 'memory' || drivers.MAIL_DRIVER === 'memory')
  ) {
    throw new Error('Memory storage/mail drivers are not allowed in production');
  }
  return drivers;
}
