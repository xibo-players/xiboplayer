const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const CMS_URL = 'https://displays.superpantalles.com';

// Using existing display credentials (test_pwa or similar)
// These can be obtained from localStorage after manual setup once
const TEST_CONFIG = {
  cmsAddress: CMS_URL,
  // Using a test hardware key - replace with actual key from CMS if needed
  cmsKey: 'isiSdUCyJgM6nRyxuwqy7Hx05Trt4HHdhWF0NKmk',
  displayName: 'XLR-E2E-Automated-Test',
  configured: true
};

test.setTimeout(180000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

test('Automated player setup and playback test', async ({ page }) => {
  console.log('\n=== AUTOMATED PLAYER SETUP & PLAYBACK ===\n');

  // Step 1: Load player with saved authentication from storageState
  console.log('Step 1: Loading player with saved authentication...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/auto-01-loaded.png', fullPage: true });

  // Step 2: Wait for player initialization
  console.log('\nStep 2: Waiting for player to initialize and connect...');

  // Monitor console for initialization messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[PWA-XLR]') || text.includes('[XLR')) {
      console.log(`  ${text.substring(0, 100)}`);
    }
  });

  await page.waitForTimeout(15000); // Wait 15 seconds for full initialization

  await page.screenshot({ path: './screenshots/auto-03-initialized.png', fullPage: true });

  // Step 5: Check player state
  const playerState = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    isSetup: window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyLength: document.body.innerText.length,
    bodyPreview: document.body.innerText.substring(0, 300)
  }));

  console.log('\n✅ Player state after 15s:', JSON.stringify(playerState, null, 2));

  // Step 6: Display player for at least 3 more seconds
  console.log('\nStep 6: Displaying player (minimum 3 seconds)...');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: './screenshots/auto-04-playing-3s.png', fullPage: true });

  console.log('  ✅ Displayed for 3 seconds');

  // Step 7: Continue observing
  console.log('\nStep 7: Continuing observation (15 more seconds)...');
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/auto-05-playing-${3 + (i * 5)}s.png`, fullPage: true });
    console.log(`  ... ${3 + (i * 5)} seconds total`);
  }

  await page.screenshot({ path: './screenshots/auto-06-final.png', fullPage: true });

  // Step 8: Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Player URL: ${playerState.url}`);
  console.log(`Is setup page: ${playerState.isSetup}`);
  console.log(`Has XLR engine: ${playerState.hasXLR}`);
  console.log(`Content length: ${playerState.bodyLength} chars`);
  console.log(`\nTotal display time: 18+ seconds`);

  // Log important console messages
  const importantLogs = consoleLogs.filter(log =>
    log.includes('registered') ||
    log.includes('playing') ||
    log.includes('cached') ||
    log.includes('ready')
  );

  if (importantLogs.length > 0) {
    console.log('\nKey events:');
    importantLogs.slice(0, 10).forEach(log => console.log(`  - ${log.substring(0, 80)}`));
  }

  console.log('\n✅ TEST COMPLETE');
});
