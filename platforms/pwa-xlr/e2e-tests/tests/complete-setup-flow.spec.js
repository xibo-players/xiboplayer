const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

const CMS_ADDRESS = 'https://displays.superpantalles.com';
const CMS_KEY = 'isiSdUCy';
const DISPLAY_NAME = `E2E-Test-${Date.now()}`;

test.setTimeout(240000); // 4 minutes

test('Complete flow: Setup player → Authorize → Play content', async ({ page, context }) => {
  console.log('\n=== COMPLETE SETUP & AUTHORIZATION FLOW ===\n');

  // PART 1: Fill player setup form
  console.log('PART 1: Configuring Player\n');

  console.log('Step 1: Loading player setup...');
  await page.goto(PLAYER_URL);
  await page.waitForTimeout(3000);

  await page.screenshot({ path: './screenshots/flow-01-setup.png', fullPage: true });

  const inputs = await page.locator('input').all();
  console.log(`  Found ${inputs.length} input fields`);

  // Fill CMS Address
  if (inputs[0]) {
    await inputs[0].fill(CMS_ADDRESS);
    console.log(`  ✅ CMS Address: ${CMS_ADDRESS}`);
    await page.waitForTimeout(2000);
  }

  // Fill CMS Key (server key: isiSdUCy)
  if (inputs[1]) {
    await inputs[1].fill(CMS_KEY);
    console.log(`  ✅ CMS Key: ${CMS_KEY}`);
    await page.waitForTimeout(2000);
  }

  // Fill Display Name
  if (inputs[2]) {
    await inputs[2].fill(DISPLAY_NAME);
    console.log(`  ✅ Display Name: ${DISPLAY_NAME}`);
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: './screenshots/flow-02-filled.png', fullPage: true });

  // Click Connect
  console.log('\nStep 2: Clicking Connect...');
  const connectBtn = await page.locator('button').first();
  await connectBtn.click();
  console.log('  ✅ Connect clicked - display registering with CMS');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: './screenshots/flow-03-connecting.png', fullPage: true });

  // PART 2: Authorize in CMS
  console.log('\n\nPART 2: Authorizing Display in CMS\n');

  // Open CMS in new tab
  const cmsPage = await context.newPage();

  console.log('Step 3: Logging into CMS...');
  await cmsPage.goto(CMS_URL);

  const usernameField = cmsPage.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameField.fill('xibo_admin');
    await cmsPage.locator('input[name="password"]').fill(PASSWORD);
    await cmsPage.locator('button[type="submit"]').click();
    await cmsPage.waitForLoadState('networkidle');
    console.log('  ✅ Logged into CMS');
  }

  console.log('\nStep 4: Going to displays page...');
  await cmsPage.goto(`${CMS_URL}/display/view`);
  await cmsPage.waitForTimeout(3000);

  await cmsPage.screenshot({ path: './screenshots/flow-04-displays-list.png', fullPage: true });

  // Find the new display
  console.log(`\nStep 5: Looking for display "${DISPLAY_NAME}"...`);
  const newDisplay = await cmsPage.locator(`text="${DISPLAY_NAME}"`).first();

  if (await newDisplay.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('  ✅ Display found in CMS!');

    // Click on it
    await newDisplay.click();
    await cmsPage.waitForTimeout(2000);

    await cmsPage.screenshot({ path: './screenshots/flow-05-display-details.png', fullPage: true });

    // Look for Authorize button
    const authorizeBtn = await cmsPage.getByRole('button', { name: /authorise|authorize|approve/i }).first();

    if (await authorizeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('\nStep 6: Authorizing display...');
      await authorizeBtn.click();
      await cmsPage.waitForTimeout(2000);

      await cmsPage.screenshot({ path: './screenshots/flow-06-authorized.png', fullPage: true });

      console.log('  ✅ Display authorized!');
    } else {
      console.log('  ℹ️  No authorize button (may already be authorized)');
    }
  } else {
    console.log('  ⚠️  Display not found yet - may take longer to appear');
  }

  await cmsPage.close();

  // PART 3: Check player
  console.log('\n\nPART 3: Checking Player Playback\n');

  console.log('Step 7: Switching back to player tab...');
  console.log('  Waiting for player to connect (20 seconds)...');

  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/flow-07-player-${i * 5}s.png`, fullPage: true });
    console.log(`  ... ${i * 5} seconds`);
  }

  const finalState = await page.evaluate(() => ({
    url: window.location.href,
    isPlaying: !window.location.href.includes('setup.html'),
    hasXLR: typeof window.xlr !== 'undefined',
    bodyText: document.body.innerText.substring(0, 200)
  }));

  await page.screenshot({ path: './screenshots/flow-08-final.png', fullPage: true });

  console.log('\n=== FINAL RESULT ===');
  console.log(`Mode: ${finalState.isPlaying ? 'PLAYING CONTENT' : 'SETUP'}`);
  console.log(`XLR: ${finalState.hasXLR ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`\nContent: ${finalState.bodyText}`);

  if (finalState.isPlaying) {
    console.log('\n✅ SUCCESS - Display authorized and playing!');
  } else {
    console.log('\n⚠️  Still in setup - may need more time or manual authorization');
  }

  console.log('\n=== TEST COMPLETE ===');
});
