import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // `@vitejs/plugin-react` is intentionally not used: `vite` is not installed at the
  // top level, so the plugin cannot load. Vitest transforms JSX/TSX on its own (oxc);
  // the React Fast-Refresh the plugin adds is irrelevant in a test run.
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) }],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // The `forks` pool's worker handshake is unreliable on this environment (heavy
    // cold-start). A single non-parallel thread is the most reliable here.
    pool: 'threads',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30_000,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'contracts'],
  },
});
