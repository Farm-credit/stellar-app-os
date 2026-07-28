import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: false,
    include: ['lib/**/*.test.ts', 'lib/**/__tests__/**/*.ts'],
  },
});
