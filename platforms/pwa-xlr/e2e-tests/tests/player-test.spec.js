const { test, expect } = require('@playwright/test');

test.use({ storageState: 'playwright/.auth/player-auth.json' });

test('Player - Load and check functionality', async ({ page }) => {
  console.log('=== PLAYER FUNCTIONALITY TEST ===\n');

  // Step 1: Go directly to player
  console.log('Step 1: Loading player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/player-01-loaded.png', fullPage: true });

  // Step 2: Check page loaded
  const title = await page.title();
  console.log(`✅ Player loaded - Title: ${title}`);

  // Step 3: Check for JavaScript errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.waitForTimeout(3000);

  console.log(`✅ Console errors: ${errors.length}`);

  // Step 4: Check DOM structure
  const domInfo = await page.evaluate(() => {
    return {
      hasBody: !!document.body,
      bodyText: document.body.innerText.substring(0, 200),
      elementCount: document.querySelectorAll('*').length,
      hasH1: !!document.querySelector('h1'),
      h1Text: document.querySelector('h1')?.innerText,
      hasForm: !!document.querySelector('form'),
      hasInput: !!document.querySelector('input'),
      hasButton: !!document.querySelector('button')
    };
  });

  console.log('\n✅ DOM Structure:', JSON.stringify(domInfo, null, 2));

  await page.screenshot({ path: './screenshots/player-02-dom-check.png', fullPage: true });

  // Step 5: Check for Service Worker API
  const swInfo = await page.evaluate(() => {
    return {
      swSupported: 'serviceWorker' in navigator,
      cacheSupported: 'caches' in window,
      indexedDBSupported: 'indexedDB' in window
    };
  });

  console.log('\n✅ Browser APIs:', JSON.stringify(swInfo, null, 2));
  expect(swInfo.swSupported).toBe(true);

  // Step 6: Wait and observe
  console.log('\nStep 6: Observing player for 10 seconds...');
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(2000);
    console.log(`  ... ${i * 2} seconds`);
    await page.screenshot({ path: `./screenshots/player-03-observe-${i * 2}s.png`, fullPage: true });
  }

  // Step 7: Final checks
  const finalState = await page.evaluate(() => {
    return {
      url: window.location.href,
      readyState: document.readyState,
      visibilityState: document.visibilityState
    };
  });

  console.log('\n✅ Final state:', JSON.stringify(finalState, null, 2));

  await page.screenshot({ path: './screenshots/player-04-final.png', fullPage: true });

  console.log('\n=== TEST COMPLETE ===');
  console.log('Check screenshots in: ./screenshots/player-*.png');
});
