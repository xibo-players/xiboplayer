import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000, // 2 min per test — player needs time to collect + render
  retries: 1,
  workers: 1, // Serial — shared CMS state
  use: {
    // Player URL from env
    baseURL: process.env.PLAYER_URL || 'https://xibo-dev.superpantalles.com/player/pwa/',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ]
});
