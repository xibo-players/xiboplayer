/**
 * Automated PWA Image Loading Test
 *
 * Tests that images load correctly in the PWA player using an existing authorized display
 */

const { chromium } = require('playwright');

async function testPWAImageLoading() {
  console.log('[TEST] Starting PWA image loading test...\n');

  const browser = await chromium.launch({
    headless: false,  // Show browser for debugging
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    permissions: ['notifications']
  });

  const page = await context.newPage();

  // Listen to console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PWA]') || text.includes('[CacheProxy') || text.includes('[SW]') ||
        text.includes('[RendererLite]') || text.includes('Media 1')) {
      console.log(`  ${text}`);
    }
  });

  // Listen to SW console separately
  const swLogs = [];
  context.on('serviceworker', async sw => {
    console.log('[TEST] Service Worker detected');
    sw.on('console', msg => {
      const text = msg.text();
      swLogs.push(text);
      if (text.includes('[SW]')) {
        console.log(`  SW: ${text}`);
      }
    });
  });

  try {
    console.log('[TEST] Navigating to PWA player...');
    await page.goto('https://displays.superpantalles.com/player/pwa/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('[TEST] Waiting for player to initialize...');
    await page.waitForSelector('text=Playing layout', { timeout: 30000 });

    console.log('[TEST] Waiting 5s for layout to render...');
    await page.waitForTimeout(5000);

    // Check if image widget exists
    console.log('[TEST] Checking for image widget...');
    const imageWidget = await page.locator('[data-widget-type="image"]').count();
    console.log(`[TEST] Image widgets found: ${imageWidget}`);

    // Check if image element exists
    const imageElements = await page.locator('img[src^="blob:"]').count();
    console.log(`[TEST] Image elements with blob URLs: ${imageElements}`);

    // Take screenshot
    const screenshotPath = '/home/pau/Downloads/pwa-playwright-test.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[TEST] Screenshot saved: ${screenshotPath}`);

    // Check console logs for errors
    const hasImageError = await page.evaluate(() => {
      const logs = performance.getEntriesByType('resource');
      return logs.some(l => l.name.includes('/cache/media/1') && l.transferSize === 0);
    });

    console.log(`[TEST] Image load error detected: ${hasImageError ? 'YES ❌' : 'NO ✓'}`);

    // Summary
    console.log('\n[TEST] ===== SUMMARY =====');
    console.log(`[TEST] Image widgets: ${imageWidget}`);
    console.log(`[TEST] Blob URLs: ${imageElements}`);
    console.log(`[TEST] SW logs captured: ${swLogs.length}`);
    console.log(`[TEST] Result: ${imageElements > 0 ? 'SUCCESS ✓ Image loaded!' : 'FAILED ❌ No image'}`);

  } catch (error) {
    console.error('[TEST] ERROR:', error.message);
  } finally {
    await browser.close();
  }
}

testPWAImageLoading().catch(console.error);
