import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Provides localStorage, window, etc.
    globals: true,
  },
});
