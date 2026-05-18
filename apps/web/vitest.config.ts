/**
 * Vitest config — Stage 19.
 *
 * Excludes Playwright e2e specs from Vitest discovery so the unit test
 * runner doesn't try to evaluate `test.skip` (Playwright API) at file load.
 * Playwright runs via `pnpm --filter @mm/web e2e` separately.
 *
 * @/ alias mirrors tsconfig.json paths: "@/*": ["./src/*"].
 * Required for tests that import components which use the @/ alias internally.
 */
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    exclude: ['node_modules/**', 'playwright/**', '.next/**'],
  },
});
