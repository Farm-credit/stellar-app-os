import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) }],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'contracts'],
  },
});