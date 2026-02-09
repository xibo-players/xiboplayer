const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const CMS_URL = 'https://displays.superpantalles.com';

// Known working configuration from test_pwa display
const PLAYER_CONFIG = {
  cmsAddress: CMS_URL,
  serverKey: 'isiSdUCy',
  hardwareKey: 'b3e800000000093dc477', // From test_pwa display
  displayName: 'test_pwa',
  displayId: 45,
  configured: true
};

test.setTimeout(120000);

test('Player with credentials - Show playback for 5 seconds', async ({ page }) => {
  console.log('\n=== PLAYER PLAYBACK TEST (5 SEC DISPLAY) ===\n');

  // Step 1: Load player and inject config
  console.log('Step 1: Loading player...');
  await page.goto(PLAYER_URL);

  // Inject configuration before page fully loads
  await page.evaluate((config) => {
    localStorage.setItem('xiboConfig', JSON.stringify({
      url: config.cmsAddress,
      key: config.hardwareKey,
      serverKey: config.serverKey,
      displayName: config.displayName
    }));
  }, PLAYER_CONFIG);

  console.log(`✅ Config injected for display: ${PLAYER_CONFIG.displayName}`);

  // Step 2: Reload to use config
  console.log('\nStep 2: Reloading with configuration...');
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/cred-01-loading.png', fullPage: true });

  // Step 3: Wait for initialization
  console.log('\nStep 3: Waiting for player initialization (10 seconds)...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/cred-02-initialized.png', fullPage: true });

  // Step 4: Display for 5 seconds
  console.log('\nStep 4: Displaying player for 5 seconds...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/cred-03-playing-5s.png', fullPage: true });

  // Step 5: Check state
  const state = await page.evaluate(() => ({
    url: window.location.href,
    isSetup: window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    title: document.title,
    bodyPreview: document.body.innerText.substring(0, 200)
  }));

  console.log('\n✅ Player state:', JSON.stringify(state, null, 2));
  console.log(`\nTotal display time: 15+ seconds`);
  console.log(`Player mode: ${state.isSetup ? 'SETUP' : 'PLAYBACK'}`);

  await page.screenshot({ path: './screenshots/cred-04-final.png', fullPage: true });

  console.log('\n=== TEST COMPLETE ===');
});
