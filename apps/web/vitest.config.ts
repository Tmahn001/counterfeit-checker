import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    // Never let vite transform the 10 MB OpenCV.js bundle — load it natively in Node.
    server: { deps: { external: [/@techstark\/opencv-js/] } },
    pool: 'forks', // the emscripten runtime holds worker threads open; forked processes exit cleanly
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'out', 'e2e/**'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['lib/vision/**', 'lib/inference/**', 'lib/telemetry/**', 'lib/scan/**'],
      // Worker/hook glue is exercised by the Playwright e2e suite, not unit tests.
      exclude: [
        '**/*.test.*',
        'lib/vision/opencv-module.ts',
        'lib/scan/engine.worker.ts',
        'lib/scan/engineClient.ts',
        'lib/scan/useScanFlow.ts',
        'lib/scan/protocol.ts',
        'lib/telemetry/index.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
      reporter: ['text', 'lcov'],
    },
  },
});
