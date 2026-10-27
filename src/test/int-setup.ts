import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vitest globalSetup for integration tests (`pnpm test:int`).
 *
 * Points DATABASE_URL at DATABASE_URL_TEST and resets that database with
 * `prisma migrate reset --force --skip-seed`, so every run starts from the
 * migrations (including the AuditLog append-only trigger).
 */
export default function setup(): void {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const envFile = path.join(root, '.env');
  if (!process.env.DATABASE_URL_TEST && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST is required for integration tests');
  }
  // Safety net: the reset wipes the target DB, so it must be a test database.
  const dbName = new URL(testUrl).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": DATABASE_URL_TEST must point to a *test* DB`);
  }

  process.env.DATABASE_URL = testUrl;

  // Env passed explicitly so the child process sees it on Windows too. This
  // forwards PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION if the *user* set it
  // in their own shell (Prisma's AI-agent guard); it is deliberately never
  // hard-coded here, so consent stays a per-invocation human decision.
  execSync('pnpm exec prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
