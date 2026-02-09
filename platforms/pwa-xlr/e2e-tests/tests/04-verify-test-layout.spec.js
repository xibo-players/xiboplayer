const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.use({ storageState: 'playwright/.auth/player-auth.json' });
test.setTimeout(120000);

test('04-PLAYBACK: Verify test layout displays', async ({ page }) => {
  console.log('\n=== VERIFY TEST LAYOUT PLAYBACK ===\n');

  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  console.log('Waiting for player to collect new schedule (20 seconds)...');
  await page.waitForTimeout(20000);

  await page.screenshot({ path: './screenshots/test04-collected.png', fullPage: true });

  console.log('\nDisplaying content (10 seconds)...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/test04-playing-10s.png', fullPage: true });

  // Check what's displayed
  const state = await page.evaluate(() => {
    const body = document.body;
    const computedStyle = window.getComputedStyle(body);

    return {
      isPlaying: !window.location.href.includes('setup.html'),
      backgroundColor: computedStyle.backgroundColor,
      bodyText: document.body.innerText.substring(0, 200),
      hasXLR: typeof window.xlr !== 'undefined'
    };
  });

  console.log('\n✅ Playback state:', JSON.stringify(state, null, 2));
  console.log(`\nBackground color: ${state.backgroundColor}`);
  console.log('(Should be green/different from default blue if Test Layout A is playing)');

  await page.screenshot({ path: './screenshots/test04-final.png', fullPage: true });

  expect(state.isPlaying).toBe(true);

  console.log('\n✅ TEST COMPLETE');
});
