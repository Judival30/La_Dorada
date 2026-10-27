import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next; tests need the automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'prisma/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.int.test.ts'],
    coverage: { provider: 'v8' },
  },
});
