const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.use({ storageState: 'playwright/.auth/player-auth.json' });
test.setTimeout(90000);

test('02-PLAYBACK: Player stability over 30 seconds', async ({ page }) => {
  console.log('\n=== TEST: Player Stability ===\n');

  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  console.log('Initializing (10 seconds)...');
  await page.waitForTimeout(10000);

  console.log('\nObserving stability (30 seconds)...');
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/test02-stability-${i * 5}s.png`, fullPage: true });
    console.log(`  ... ${i * 5} seconds`);
  }

  const state = await page.evaluate(() => ({
    isPlaying: !window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined'
  }));

  expect(state.isPlaying).toBe(true);

  console.log('\n✅ TEST PASSED - Player stable for 30 seconds');
});
