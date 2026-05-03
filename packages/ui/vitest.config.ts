import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
