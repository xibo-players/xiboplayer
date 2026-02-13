import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API integration tests need real Node.js (not jsdom)
    environment: 'node',
    // Don't use the root setup file (mocks fetch, adds jsdom shims)
    setupFiles: [],
    // API integration tests run against real CMS — longer timeouts
    testTimeout: 30000,
    hookTimeout: 30000,
    // Run serially to avoid race conditions on shared CMS state
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
});
