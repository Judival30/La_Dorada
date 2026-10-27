import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Integration suite (`pnpm test:int`): real Postgres via DATABASE_URL_TEST. */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts', 'prisma/**/*.int.test.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./src/test/int-setup.ts'],
    // Test files share one database: run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
