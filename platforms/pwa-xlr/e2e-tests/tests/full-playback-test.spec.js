const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.setTimeout(180000); // 3 minutes

async function login(page) {
  await page.goto(CMS_URL);
  const usernameField = page.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameField.fill('xibo_admin');
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }
}

test('FULL TEST: Assign layout to display and verify player shows it', async ({ page }) => {
  await login(page);

  console.log('\n=== FULL PLAYBACK TEST ===\n');

  // Step 1: Check existing displays
  console.log('Step 1: Getting display information...');
  await page.goto(`${CMS_URL}/display/view`);
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/full-01-displays.png', fullPage: true });

  const displayInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr[data-display-id]');
    return Array.from(rows).map(row => ({
      id: row.getAttribute('data-display-id'),
      name: row.querySelector('td:nth-child(2)')?.innerText
    })).slice(0, 3);
  });

  console.log('  Available displays:', displayInfo);

  // Step 2: Check what layout is assigned to first display
  if (displayInfo.length > 0) {
    const firstDisplay = displayInfo[0];
    console.log(`\nStep 2: Checking display "${firstDisplay.name}" (ID: ${firstDisplay.id})...`);

    // Click on first display
    const displayRow = await page.locator(`tr[data-display-id="${firstDisplay.id}"]`).first();
    await displayRow.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/full-02-display-details.png', fullPage: true });

    console.log('✅ Display details opened');
  }

  // Step 3: Check campaigns
  console.log('\nStep 3: Checking campaigns...');
  await page.goto(`${CMS_URL}/campaign/view`);
  await page.waitForTimeout(2000);

  await page.screenshot({ path: './screenshots/full-03-campaigns.png', fullPage: true });

  const campaigns = await page.evaluate(() => {
    const items = document.querySelectorAll('tr');
    const campaignList = [];
    items.forEach(row => {
      const text = row.innerText;
      if (text.includes('Campaign') || text.includes('Test Layout')) {
        campaignList.push(text.split('\t').filter(t => t.trim()).slice(0, 3).join(' | '));
      }
    });
    return campaignList.slice(0, 5);
  });

  console.log('  Campaigns found:');
  campaigns.forEach(c => console.log(`    - ${c}`));

  // Step 4: Go to player
  console.log('\nStep 4: Opening player...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: './screenshots/full-04-player-loaded.png', fullPage: true });

  const playerState = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    bodyPreview: document.body.innerText.substring(0, 200),
    hasSetupForm: !!document.querySelector('form'),
    h1Text: document.querySelector('h1')?.innerText
  }));

  console.log('\n  Player state:', JSON.stringify(playerState, null, 2));

  // Step 5: Observe player
  console.log('\nStep 5: Observing player for 15 seconds...');
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/full-05-player-${i * 5}s.png`, fullPage: true });
    console.log(`  ... ${i * 5} seconds`);
  }

  // Step 6: Check console for any player activity
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.waitForTimeout(5000);

  console.log('\n  Console messages:', consoleLogs.slice(0, 10));

  await page.screenshot({ path: './screenshots/full-06-final-state.png', fullPage: true });

  console.log('\n✅ FULL TEST COMPLETE');
  console.log('\nSUMMARY:');
  console.log(`  - Displays in system: ${displayInfo.length}`);
  console.log(`  - Campaigns found: ${campaigns.length}`);
  console.log(`  - Player status: ${playerState.h1Text}`);
  console.log('\n  Player is in ${playerState.hasSetupForm ? "SETUP MODE" : "PLAYBACK MODE"}');
  console.log('  To see content playback, the player needs to be licensed with a display.');
});
