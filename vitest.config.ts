import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'contracts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    css: true,
      '@': fileURLToPath(new URL('.', import.meta.url)),
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) }],
  test: {
    exclude: [
      'node_modules',
      '.next',
      'contracts',
      'lib/api/impactData.test.ts',
      'lib/geo/regionHash.test.ts',
    ],
  },
});