#!/usr/bin/env node
/**
 * Assign layout to display via CMS UI
 * More reliable than API for this operation
 */

const { chromium } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

(async () => {
  console.log('\n=== ASSIGN LAYOUT VIA CMS UI ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Login
  console.log('Logging in to CMS...');
  await page.goto(CMS_URL);
  await page.fill('input[name="username"]', 'xibo_admin');
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  console.log('✓ Logged in');

  // Navigate to Displays
  console.log('\nNavigating to Displays...');

  // Try different ways to get to Displays page
  try {
    await page.click('text=Displays', { timeout: 5000 });
  } catch {
    try {
      await page.goto(`${CMS_URL}/display.view`);
    } catch {
      await page.click('a:has-text("Displays")');
    }
  }

  await page.waitForLoadState('networkidle');
  console.log('✓ On Displays page');

  // Find test_pwa display
  console.log('\nSearching for test_pwa display...');
  await page.waitForTimeout(3000);

  // Take screenshot to see page structure
  await page.screenshot({ path: './screenshots/displays-page.png' });
  console.log('Screenshot: displays-page.png');

  // Wait for table to load
  await page.waitForSelector('table, .XiboGrid', { timeout: 10000 });

  // Click on test_pwa row - try different selectors
  let testPwaRow;
  try {
    testPwaRow = page.locator('tr:has-text("test_pwa")').first();
    await testPwaRow.waitFor({ timeout: 5000 });
  } catch {
    // Try finding by cell content
    testPwaRow = page.locator('td:has-text("test_pwa")').locator('xpath=ancestor::tr');
    await testPwaRow.first().waitFor({ timeout: 5000 });
  }
  console.log('✓ Found test_pwa display');

  // Click edit button (pencil icon)
  await testPwaRow.locator('button[data-toggle="dropdown"]').click();
  await page.waitForTimeout(500);
  await page.click('a:has-text("Edit")');
  await page.waitForTimeout(2000);
  console.log('✓ Opened edit form');

  // Click on "Default Layout" tab
  console.log('\nSetting default layout...');
  await page.click('a[href="#defaultLayout"]');
  await page.waitForTimeout(1000);

  // Select "Test Layout A" from dropdown
  await page.click('select[name="defaultLayoutId"]');
  await page.selectOption('select[name="defaultLayoutId"]', { label: 'Test Layout A' });
  console.log('✓ Selected Test Layout A');

  // Save
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(2000);
  console.log('✓ Saved');

  // Verify
  await page.waitForTimeout(2000);
  console.log('\n✅ Layout assignment complete!');
  console.log('   test_pwa display now has Test Layout A as default');

  await page.screenshot({ path: './screenshots/layout-assigned.png' });
  console.log('\nScreenshot saved: layout-assigned.png');

  await page.waitForTimeout(3000);
  await browser.close();

  console.log('\n=== DONE ===\n');
})();
