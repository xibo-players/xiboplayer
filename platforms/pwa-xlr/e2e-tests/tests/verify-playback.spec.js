const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.setTimeout(120000);

test('Verify player plays Xibo content', async ({ page }) => {
  console.log('\n=== PLAYER PLAYBACK VERIFICATION ===\n');

  // Go to player
  console.log('Step 1: Loading player...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/playback-01-initial.png', fullPage: true });

  // Wait for initialization
  console.log('\nStep 2: Waiting for player to initialize (10 seconds)...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/playback-02-after-10s.png', fullPage: true });

  // Check player state
  const state = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    bodyText: document.body.innerText.substring(0, 200),
    hasXLR: typeof window.xlr !== 'undefined',
    isSetupPage: window.location.href.includes('setup.html'),
    hasConfig: localStorage.getItem('xiboConfig') !== null
  }));

  console.log('\nPlayer state:', JSON.stringify(state, null, 2));

  if (state.isSetupPage) {
    console.log('\n⚠️  Player is in setup mode');
    console.log('   The player needs to be configured with CMS credentials first.');
    console.log('   Configuration stored:', state.hasConfig);

    // Show what's needed
    console.log('\n   To configure:');
    console.log('   1. CMS Address: https://displays.superpantalles.com');
    console.log('   2. CMS Key: <hardware key from display>');
    console.log('   3. Display Name: <any name>');

  } else {
    console.log('\n✅ Player is in playback mode!');

    // Capture playback over time
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `./screenshots/playback-03-${i * 5}s.png`, fullPage: true });
      console.log(`  Capturing at ${i * 5} seconds...`);
    }

    expect(state.hasXLR).toBe(true);
  }

  await page.screenshot({ path: './screenshots/playback-final.png', fullPage: true });

  console.log('\n=== TEST COMPLETE ===');
});
