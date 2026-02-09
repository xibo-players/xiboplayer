const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

// Working credentials
const CMS_ADDRESS = 'https://displays.superpantalles.com';
const CMS_KEY = 'isiSdUCy';
const HARDWARE_KEY = '000000000000000000000000093dc477';
const DISPLAY_NAME = 'E2E-Test-Player';

test.setTimeout(120000);

test('Fill setup form and play - 5 second display', async ({ page }) => {
  console.log('\n=== FILL SETUP FORM & PLAY ===\n');

  // Step 1: Go to player
  console.log('Step 1: Loading player setup...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/setup-01-form.png', fullPage: true });

  // Step 2: Fill in the form
  console.log('\nStep 2: Filling setup form...');

  // Fill all form fields
  const formFields = await page.locator('input[type="text"]').all();

  console.log(`  Found ${formFields.length} input fields`);

  // Typically: CMS Address, CMS Key, Display Name
  if (formFields.length >= 3) {
    await formFields[0].fill(CMS_ADDRESS);
    console.log('  ✅ Field 1 (CMS Address): filled');

    // CMS Key format: serverKey (not hardware key)
    await formFields[1].fill(CMS_KEY);
    console.log(`  ✅ Field 2 (CMS Key): ${CMS_KEY}`);

    await formFields[2].fill(DISPLAY_NAME);
    console.log('  ✅ Field 3 (Display Name): filled');
  }

  await page.screenshot({ path: './screenshots/setup-02-filled.png', fullPage: true });

  // Step 3: Click Connect
  console.log('\nStep 3: Clicking Connect...');
  const connectBtn = await page.getByRole('button', { name: /connect|connecta/i }).first();
  if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await connectBtn.click();
    console.log('  ✅ Connect clicked');

    // Wait for connection
    console.log('\nStep 4: Waiting for connection and initialization (15 seconds)...');
    await page.waitForTimeout(15000);

    await page.screenshot({ path: './screenshots/setup-03-connecting.png', fullPage: true });
  }

  // Step 5: Display for 5 seconds
  console.log('\nStep 5: Displaying player (5 seconds)...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/setup-04-playing-5s.png', fullPage: true });

  // Step 6: Continue for total of 10 seconds
  console.log('\nStep 6: Continuing display (5 more seconds)...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/setup-05-playing-10s.png', fullPage: true });

  // Check final state
  const state = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    isSetup: window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyLength: document.body.innerText.length
  }));

  console.log('\n✅ Final state:', JSON.stringify(state, null, 2));
  console.log(`Total display time: 30+ seconds`);

  await page.screenshot({ path: './screenshots/setup-06-final.png', fullPage: true });

  console.log('\n=== TEST COMPLETE ===');
});
