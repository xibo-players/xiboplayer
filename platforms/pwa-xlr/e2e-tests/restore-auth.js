#!/usr/bin/env node

/**
 * Restore Player Authentication
 *
 * Re-applies saved authentication to the player
 * Run this if the player shows credentials screen again
 */

const { chromium } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

const CONFIG = {
  cmsAddress: "https://displays.superpantalles.com",
  cmsKey: "isiSdUCy",
  displayName: "test_pwa",
  hardwareKey: "000000000000000000000000093dc477",
  xmrChannel: "794ef61c-f55e-4752-89a7-a3857db653db"
};

(async () => {
  console.log('\n=== RESTORING PLAYER AUTHENTICATION ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Go to player
  console.log('Loading player...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  // Check current state
  const currentState = await page.evaluate(() => {
    const config = localStorage.getItem('xibo_config');
    return {
      hasConfig: !!config,
      config: config ? JSON.parse(config) : null,
      url: window.location.href
    };
  });

  console.log('\nCurrent state:');
  console.log('  Has config:', currentState.hasConfig);
  console.log('  URL:', currentState.url);
  console.log('  Is setup page:', currentState.url.includes('setup.html'));

  if (currentState.hasConfig) {
    console.log('  Display name:', currentState.config.displayName);
  }

  // Restore config
  console.log('\nRestoring authentication...');
  await page.evaluate((config) => {
    localStorage.setItem('xibo_config', JSON.stringify(config));
    console.log('[Restored] xibo_config set');
  }, CONFIG);

  // Save storage state
  await context.storageState({ path: 'playwright/.auth/player-auth.json' });
  console.log('✓ Saved to playwright/.auth/player-auth.json');

  // Reload player
  console.log('\nReloading player...');
  await page.goto(PLAYER_URL);
  await page.waitForTimeout(5000);

  // Check new state
  const newState = await page.evaluate(() => {
    return {
      url: window.location.href,
      isSetup: window.location.href.includes('setup.html'),
      hasXLR: typeof window.xlr !== 'undefined',
      bodyText: document.body.innerText.substring(0, 150)
    };
  });

  console.log('\nAfter restore:');
  console.log('  URL:', newState.url);
  console.log('  Is setup page:', newState.isSetup);
  console.log('  Has XLR:', newState.hasXLR);

  if (newState.isSetup) {
    console.log('\n⚠️  Still on setup page!');
    console.log('This might indicate a different issue.');
    console.log('Taking screenshot...');
    await page.screenshot({ path: './screenshots/restore-auth-issue.png' });
  } else {
    console.log('\n✓ Authentication restored successfully!');
    console.log('✓ Player is now authenticated');
    await page.screenshot({ path: './screenshots/restore-auth-success.png' });
  }

  console.log('\nWaiting 10 seconds to observe...');
  await page.waitForTimeout(10000);

  await browser.close();

  console.log('\n=== DONE ===\n');
  process.exit(newState.isSetup ? 1 : 0);
})();
