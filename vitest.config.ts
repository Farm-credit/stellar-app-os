import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/types/**',
        '**/vitest.setup.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
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
  },
});
