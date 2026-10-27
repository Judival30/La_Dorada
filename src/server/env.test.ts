import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const full = {
  DATABASE_URL: 'postgresql://ladorada:ladorada@localhost:5432/ladorada',
  DATABASE_URL_TEST: 'postgresql://ladorada:ladorada@localhost:5432/ladorada_test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'ladorada',
  S3_SECRET_KEY: 'ladorada-secret',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  APP_URL: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = parseEnv(full);
    expect(env.SESSION_TTL_DAYS).toBe(7);
    expect(env.S3_BUCKET).toBe('ladorada-private');
    expect(env.ADAPTERS_MODE).toBe('mock');
    expect(env.SMTP_PORT).toBe(1025);
  });

  it('coerces SESSION_TTL_DAYS when provided', () => {
    expect(parseEnv({ ...full, SESSION_TTL_DAYS: '14' }).SESSION_TTL_DAYS).toBe(14);
  });

  it('allows DATABASE_URL_TEST to be absent', () => {
    const rest: Record<string, string> = { ...full };
    delete rest.DATABASE_URL_TEST;
    expect(parseEnv(rest).DATABASE_URL_TEST).toBeUndefined();
  });

  it('throws ZodError when DATABASE_URL is missing', () => {
    const rest: Record<string, string> = { ...full };
    delete rest.DATABASE_URL;
    expect(() => parseEnv(rest)).toThrow(ZodError);
  });

  it('rejects an invalid APP_URL', () => {
    expect(() => parseEnv({ ...full, APP_URL: 'nope' })).toThrow(ZodError);
  });
});
