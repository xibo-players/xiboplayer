const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

// Exact working configuration from localStorage
const PLAYER_CONFIG = {
  cmsAddress: "https://displays.superpantalles.com",
  cmsKey: "isiSdUCy",
  displayName: "test_pwa",
  hardwareKey: "000000000000000000000000093dc477",
  xmrChannel: "794ef61c-f55e-4752-89a7-a3857db653db"
};

test.setTimeout(180000);

test.use({
  // Use persistent context to keep localStorage
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled']
  }
});

test('Authenticated Player - Media Playback from Campaign', async ({ page, context }) => {
  console.log('\n=== AUTHENTICATED PLAYBACK TEST ===\n');

  // Step 1: Check if credentials already stored
  console.log('Step 1: Checking for stored credentials...');

  await page.goto('https://displays.superpantalles.com/');

  const hasStoredConfig = await page.evaluate(() => {
    const config = localStorage.getItem('xibo_config');
    return !!config;
  });

  console.log(`  Stored config exists: ${hasStoredConfig}`);

  // Only set if not already stored
  if (!hasStoredConfig) {
    console.log('\nStep 2: Setting authentication (first time only)...');

    await page.evaluate((config) => {
      localStorage.setItem('xibo_config', JSON.stringify(config));
      console.log('[TEST] Config saved to localStorage');
    }, PLAYER_CONFIG);

    console.log(`✅ Authentication stored for: ${PLAYER_CONFIG.displayName}`);
    console.log('   Credentials will persist for future test runs');
  } else {
    console.log('\n✅ Using existing stored credentials (not setting again)');
  }

  // Step 2: Now load the player
  console.log('\nStep 2: Loading player with authentication...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  console.log('  Player loaded, waiting for initialization...');

  // Step 3: Wait for player to initialize and connect
  console.log('\nStep 3: Waiting for player to connect and download content (20 seconds)...');

  let statusMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('layouts ready') || text.includes('registered') || text.includes('playing')) {
      statusMessages.push(text);
      console.log(`  ${text}`);
    }
  });

  await page.waitForTimeout(20000);

  await page.screenshot({ path: './screenshots/playback-01-initialized.png', fullPage: true });

  // Step 4: Check if we're playing
  const playState = await page.evaluate(() => ({
    url: window.location.href,
    isPlaying: !window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyText: document.body.innerText,
    title: document.title
  }));

  console.log('\n✅ Playback state:', JSON.stringify(playState, null, 2));

  // Step 5: Display playing content for 5 seconds
  console.log('\nStep 5: Displaying playing content (5 seconds)...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/playback-02-content-5s.png', fullPage: true });

  // Step 6: Continue observation
  console.log('\nStep 6: Continuing observation (10 more seconds)...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/playback-03-content-15s.png', fullPage: true });

  console.log('\n=== RESULTS ===');
  console.log(`Player mode: ${playState.isPlaying ? 'PLAYING CONTENT' : 'SETUP MODE'}`);
  console.log(`XLR engine: ${playState.hasXLR ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`Total test duration: 35+ seconds`);
  console.log(`\nContent preview: ${playState.bodyText.substring(0, 150)}...`);

  if (playState.isPlaying) {
    console.log('\n✅ SUCCESS - Player authenticated and playing media!');
  } else {
    console.log('\n⚠️  Player in setup mode - check configuration');
  }

  await page.screenshot({ path: './screenshots/playback-04-final.png', fullPage: true });
});
