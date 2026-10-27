import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * Vitest globalSetup for integration tests (`pnpm test:int`).
 *
 * Points DATABASE_URL at DATABASE_URL_TEST, wipes that database by dropping
 * and recreating the `public` schema with plain SQL, and then applies every
 * migration with `prisma migrate deploy` (including the AuditLog append-only
 * trigger). `prisma migrate reset` is not used: Prisma blocks it for AI agents,
 * and the disposable test DB does not need its extra steps.
 */
export default async function setup(): Promise<void> {
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
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": DATABASE_URL_TEST must point to a *_test DB`);
  }

  process.env.DATABASE_URL = testUrl;

  const admin = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    const [row] = await admin.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    if (row?.current_database !== dbName) {
      throw new Error(`Connected to "${row?.current_database}", expected "${dbName}"`);
    }
    await admin.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await admin.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await admin.$disconnect();
  }

  // Env passed explicitly so the child process sees it on Windows too.
  execSync('pnpm exec prisma migrate deploy', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
