import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environment
    environment: 'jsdom', // Browser-like environment

    // Test files
    include: ['src/**/*.test.js'],
    exclude: ['node_modules', 'dist'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/**/*.spec.js'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },

    // Globals
    globals: true,

    // Timeout
    testTimeout: 10000,

    // Reporters
    reporters: ['verbose']
  }
});
