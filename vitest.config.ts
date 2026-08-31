import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) }],
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'contracts'],
    environment: 'jsdom',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'contracts/',
        '**/*.config.{js,ts}',
        '**/types/**',
        'vitest.setup.ts',
      ],
    },
  },
});
