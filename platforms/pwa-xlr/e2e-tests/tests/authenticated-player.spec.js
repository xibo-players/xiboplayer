const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

// Working configuration extracted from localStorage
const WORKING_CONFIG = {
  cmsAddress: "https://displays.superpantalles.com",
  cmsKey: "isiSdUCy",
  displayName: "test_pwa",
  hardwareKey: "000000000000000000000000093dc477",
  xmrChannel: "794ef61c-f55e-4752-89a7-a3857db653db"
};

test.setTimeout(120000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

test('Authenticated player - Show playback for 5 seconds', async ({ page }) => {
  console.log('\n=== AUTHENTICATED PLAYER PLAYBACK ===\n');

  // Step 1: Load player with saved authentication
  console.log('Step 1: Loading player...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/auth-01-loading.png', fullPage: true });

  // Step 3: Wait for initialization
  console.log('\nStep 3: Initializing (10 seconds)...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/auth-02-initialized.png', fullPage: true });

  // Step 4: Display for 5 seconds
  console.log('\nStep 4: Displaying player (5 seconds)...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/auth-03-playing-5s.png', fullPage: true });

  // Step 5: Check state
  const state = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    isSetup: window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyPreview: document.body.innerText.substring(0, 300)
  }));

  console.log('\n✅ Player state:', JSON.stringify(state, null, 2));
  console.log(`\nDisplay mode: ${state.isSetup ? 'SETUP' : 'PLAYBACK'}`);
  console.log(`Has XLR engine: ${state.hasXLR}`);
  console.log(`Total display time: 15 seconds`);

  await page.screenshot({ path: './screenshots/auth-04-final.png', fullPage: true });

  // Report status (don't fail if in setup mode)
  if (!state.isSetup && state.hasXLR) {
    console.log('\n✅ TEST PASSED - Player authenticated and playing!');
  } else {
    console.log('\n⚠️  Player in setup mode - configure manually first');
  }
});
