const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.use({ storageState: 'playwright/.auth/player-auth.json' });
test.setTimeout(90000);

test('01-PLAYBACK: Default layout plays', async ({ page }) => {
  console.log('\n=== TEST: Default Layout Playback ===\n');

  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  console.log('Waiting for player to load and play (15 seconds)...');
  await page.waitForTimeout(15000);

  await page.screenshot({ path: './screenshots/test01-default-layout.png', fullPage: true });

  const state = await page.evaluate(() => ({
    isPlaying: !window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyPreview: document.body.innerText.substring(0, 150)
  }));

  console.log('✅ Player state:', state.isPlaying ? 'PLAYING' : 'SETUP');

  // Display for 5 seconds
  console.log('\nDisplaying content (5 seconds)...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/test01-playing-5s.png', fullPage: true });

  expect(state.isPlaying).toBe(true);

  console.log('✅ TEST PASSED - Default layout playing');
});
