const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

// Working credentials
const CMS_ADDRESS = 'https://displays.superpantalles.com';
const CMS_KEY = 'isiSdUCy'; // This is what goes in the CMS Key field!

test.setTimeout(180000);

test('VISUAL: Watch player authenticate and play content', async ({ page }) => {
  console.log('\n=== VISUAL AUTHENTICATION TEST ===');
  console.log('Watch the browser - you will see each step!\n');

  // Step 1: Load setup page
  console.log('Step 1: Loading player setup page...');
  await page.goto(PLAYER_URL);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: './screenshots/visual-01-setup-page.png', fullPage: true });
  console.log('  ✅ Setup page displayed (3 seconds)');

  // Step 2: Fill CMS Address
  console.log('\nStep 2: Filling CMS Address...');
  const inputs = await page.locator('input').all();

  console.log(`  Found ${inputs.length} input fields`);

  if (inputs.length > 0) {
    await inputs[0].click();
    await page.waitForTimeout(500);
    await inputs[0].fill(CMS_ADDRESS);
    console.log(`  ✅ CMS Address: ${CMS_ADDRESS}`);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/visual-02-cms-filled.png', fullPage: true });
  }

  // Step 3: Fill CMS Key (this is the SERVER key: isiSdUCy)
  console.log('\nStep 3: Filling CMS Key...');
  if (inputs.length > 1) {
    await inputs[1].click();
    await page.waitForTimeout(1000);

    // Clear first
    await inputs[1].clear();
    await page.waitForTimeout(500);

    // Fill with SERVER key (isiSdUCy)
    await inputs[1].type(CMS_KEY, { delay: 150 }); // Type slowly so you can see it
    console.log(`  ✅ CMS Key entered: ${CMS_KEY}`);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/visual-03-key-filled.png', fullPage: true });
  }

  // Step 4: Fill Display Name if there's a third field
  console.log('\nStep 4: Filling Display Name (if present)...');
  if (inputs.length > 2) {
    await inputs[2].click();
    await page.waitForTimeout(500);
    await inputs[2].fill('E2E-Visual-Test');
    console.log('  ✅ Display Name: E2E-Visual-Test');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/visual-04-name-filled.png', fullPage: true });
  }

  // Step 5: Click Connect button
  console.log('\nStep 5: Clicking Connect button...');
  const connectBtn = await page.locator('button').first();
  await connectBtn.click();
  console.log('  ✅ Connect button clicked');

  await page.waitForTimeout(3000);
  await page.screenshot({ path: './screenshots/visual-05-connecting.png', fullPage: true });

  // Step 6: Wait for connection (longer wait)
  console.log('\nStep 6: Waiting for player to connect (40 seconds)...');
  console.log('  Watch the browser for connection progress...');

  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/visual-06-waiting-${i * 5}s.png`, fullPage: true });

    // Check if we've transitioned out of setup
    const currentUrl = page.url();
    if (!currentUrl.includes('setup.html')) {
      console.log(`  ✅ Connected! Transitioned to main player at ${i * 5}s`);
      break;
    }
    console.log(`  ... ${i * 5} seconds`);
  }

  // Step 7: Check result
  console.log('\nStep 7: Checking result...');
  const finalState = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    isPlaying: !window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyText: document.body.innerText.substring(0, 300)
  }));

  await page.screenshot({ path: './screenshots/visual-07-result.png', fullPage: true });

  console.log('\n=== FINAL STATE ===');
  console.log(`URL: ${finalState.url}`);
  console.log(`Mode: ${finalState.isPlaying ? 'PLAYING' : 'SETUP'}`);
  console.log(`XLR: ${finalState.hasXLR ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`\nContent: ${finalState.bodyText}`);

  // Step 8: If playing, observe for 10 more seconds
  if (finalState.isPlaying) {
    console.log('\n✅ SUCCESS - Player is playing! Observing for 10 more seconds...');

    for (let i = 1; i <= 2; i++) {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `./screenshots/visual-08-playing-${i * 5}s.png`, fullPage: true });
      console.log(`  ... playing for ${i * 5} seconds`);
    }
  } else {
    console.log('\n⚠️  Player still in setup mode');
    console.log('  Check screenshots to see what happened');
  }

  await page.screenshot({ path: './screenshots/visual-09-final.png', fullPage: true });

  console.log('\n=== TEST COMPLETE ===');
  console.log('Check screenshots/ directory for the complete sequence');
});
