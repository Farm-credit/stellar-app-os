import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,

    include: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'contracts'],

    setupFiles: './vitest.setup.ts',
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
import { fileURLToPath, URL } from 'node:url';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) },
      { find: '@', replacement: path.resolve(__dirname) },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],

  },
});
