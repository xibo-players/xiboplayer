#!/usr/bin/env node
/**
 * Force player to collect schedule immediately
 */

const { chromium } = require('@playwright/test');

(async () => {
  console.log('\n=== FORCE SCHEDULE COLLECTION ===\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    storageState: 'playwright/.auth/player-auth.json',
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();

  console.log('Loading player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('Taking "before" screenshot...');
  await page.screenshot({ path: './screenshots/before-force-collection.png' });

  // Force collection by triggering it via XLR API
  console.log('\nForcing schedule collection...');
  const result = await page.evaluate(() => {
    if (window.xlr && window.xlr.collectNow) {
      window.xlr.collectNow();
      return { method: 'xlr.collectNow()', triggered: true };
    } else if (window.xlrPlayer && window.xlrPlayer.collect) {
      window.xlrPlayer.collect();
      return { method: 'xlrPlayer.collect()', triggered: true };
    } else {
      // Fallback: reload player
      window.location.reload();
      return { method: 'reload', triggered: true };
    }
  });

  console.log(`✓ Triggered collection via: ${result.method}`);

  console.log('\nWaiting 30 seconds for collection and playback...');
  await page.waitForTimeout(30000);

  console.log('Taking "after" screenshot...');
  await page.screenshot({ path: './screenshots/after-force-collection.png' });

  // Check state
  const state = await page.evaluate(() => ({
    url: window.location.href,
    background: window.getComputedStyle(document.body).backgroundColor,
    bodyText: document.body.innerText.substring(0, 150),
    xlrExists: !!(window.xlr || window.xlrPlayer)
  }));

  console.log('\nPlayer state after collection:');
  console.log('  Background:', state.background);
  console.log('  XLR active:', state.xlrExists);
  console.log('  Content preview:', state.bodyText.substring(0, 80));

  if (state.background === 'rgb(194, 226, 44)' || state.background.includes('226')) {
    console.log('\n✅ SUCCESS! Green background detected - Test Layout A is showing!');
  } else {
    console.log('\n⚠️  Still showing default blue background');
  }

  console.log('\nKeeping browser open for 10 seconds so you can observe...');
  await page.waitForTimeout(10000);

  await browser.close();
  console.log('\n=== DONE ===\n');
})();
