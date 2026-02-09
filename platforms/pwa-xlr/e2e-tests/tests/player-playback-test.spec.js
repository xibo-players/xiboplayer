const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

test.describe.configure({ mode: 'serial' });

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

test.describe('Player Playback Tests', () => {

  test('TEST 1: Use existing layout with image on player', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    await login(page);

    console.log('\n=== TEST 1: IMAGE PLAYBACK ON PLAYER ===\n');

    // Step 1: Go to campaigns
    console.log('Step 1: Opening campaigns...');
    await page.goto(`${CMS_URL}/campaign/view`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: './screenshots/playback-01-campaigns.png', fullPage: true });

    // Check if Test Layout A exists (it has colored backgrounds from the debug output)
    const testLayoutA = await page.locator('text="Test Layout A"').isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  Test Layout A exists: ${testLayoutA}`);

    await page.screenshot({ path: './screenshots/playback-02-campaigns-list.png', fullPage: true });

    // Step 2: Go to schedule to see what's assigned
    console.log('\nStep 2: Checking schedule...');
    await page.goto(`${CMS_URL}/schedule/view`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: './screenshots/playback-03-schedule.png', fullPage: true });

    console.log('✅ Schedule page loaded');

    // Step 3: Go to player and observe
    console.log('\nStep 3: Opening player...');
    await page.goto('https://displays.superpantalles.com/player/xlr/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: './screenshots/playback-04-player-initial.png', fullPage: true });

    console.log('  Waiting for player to load...');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: './screenshots/playback-05-player-5s.png', fullPage: true });

    // Check what's on screen
    const playerState = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body.innerText.substring(0, 300),
        hasCanvas: !!document.querySelector('canvas'),
        hasVideo: !!document.querySelector('video'),
        hasImage: !!document.querySelector('img'),
        elementCount: document.querySelectorAll('*').length
      };
    });

    console.log('\n✅ Player state:', JSON.stringify(playerState, null, 2));

    // Observe for 10 more seconds
    console.log('\nObserving player for 10 seconds...');
    for (let i = 1; i <= 5; i++) {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `./screenshots/playback-06-player-${5 + (i * 2)}s.png`, fullPage: true });
      console.log(`  ... ${5 + (i * 2)} seconds`);
    }

    console.log('\n✅ TEST 1 COMPLETE');
  });

  test('TEST 2: Check video playback capability', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    await login(page);

    console.log('\n=== TEST 2: VIDEO PLAYBACK CHECK ===\n');

    // Step 1: Open one of our test videos in media library
    console.log('Step 1: Opening test video...');
    await page.goto(`${CMS_URL}/library/view`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: './screenshots/video-01-library.png', fullPage: true });

    // Click on test-video.mp4
    const videoRow = await page.locator('text="test-video.mp4"').first();
    if (await videoRow.isVisible({ timeout: 3000 })) {
      console.log('  Found test-video.mp4');
      await videoRow.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: './screenshots/video-02-details-dialog.png', fullPage: true });

      console.log('✅ Video details opened');

      // Look for preview/play button
      const previewBtn = await page.locator('button:has-text("Preview"), a:has-text("Preview")').first();
      if (await previewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await previewBtn.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: './screenshots/video-03-preview.png', fullPage: true });

        console.log('✅ Video preview opened');
      }
    }

    // Step 2: Check media in library
    console.log('\nStep 2: Verifying all test media...');
    await page.goto(`${CMS_URL}/library/view`);
    await page.waitForTimeout(2000);

    const mediaList = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr');
      const testMedia = [];
      rows.forEach(row => {
        const text = row.innerText;
        if (text.includes('test-')) {
          testMedia.push(text.split('\t')[0] + ' - ' + text.split('\t')[1]);
        }
      });
      return testMedia;
    });

    console.log('\n✅ Test media found:');
    mediaList.forEach(item => console.log(`  - ${item}`));

    await page.screenshot({ path: './screenshots/video-04-all-test-media.png', fullPage: true });

    console.log('\n✅ TEST 2 COMPLETE');
  });

});
