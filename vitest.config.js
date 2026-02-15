/**
 * Vitest configuration for xibo-players monorepo
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'platforms/pwa-xlr/e2e-tests/**',
      'platforms/pwa/playwright-tests/**',
      'packages/cms-testing/tests/e2e/**',
      'packages/cms-testing/tests/api/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.js'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.js',
        '**/*.spec.js'
      ]
    }
  },
  resolve: {
    alias: {
      // hls.js is dynamically imported in renderer-lite.js for HLS streaming.
      // Mock it in tests since it's a runtime-only dependency.
      'hls.js': new URL('./vitest.hls-mock.js', import.meta.url).pathname
    }
  }
});
