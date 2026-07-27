import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) }],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      '.next',
      'contracts',
      'lib/api/impactData.test.ts',
      'lib/geo/regionHash.test.ts',
    ],
  },
});
