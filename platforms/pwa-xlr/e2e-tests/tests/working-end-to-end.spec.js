const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(300000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

// Based on proven working test pattern (03-assign-test-media.spec.js)

test.describe('Working End-to-End Tests', () => {

  test('E2E-01: List all layouts and schedule one', async ({ page, request }) => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('END-TO-END TEST - USE EXISTING LAYOUT');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Authenticate ONCE
    console.log('Step 1: Getting OAuth token...');
    const tokenResponse = await request.post(`${CMS_URL}/api/authorize/access_token`, {
      form: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      ignoreHTTPSErrors: true
    });

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;
    console.log('✅ Got API token\n');

    // Get displays
    console.log('Step 2: Getting displays...');
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      ignoreHTTPSErrors: true
    });

    const displays = await displaysResp.json();
    const testPwaDisplay = displays.find(d => d.display === 'test_pwa');

    if (!testPwaDisplay) {
      console.log('❌ test_pwa display not found!');
      return;
    }

    console.log(`✅ Found test_pwa display (ID: ${testPwaDisplay.displayId})`);
    console.log(`   Display group ID: ${testPwaDisplay.displayGroupId}`);
    console.log(`   Current default layout: ${testPwaDisplay.defaultLayout} (ID: ${testPwaDisplay.defaultLayoutId})\n`);

    // Get all layouts
    console.log('Step 3: Getting all layouts...');
    const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const layouts = await layoutsResp.json();
    console.log(`✅ Found ${layouts.length} layouts:\n`);

    layouts.slice(0, 15).forEach(l => {
      console.log(`   ${l.layoutId}. ${l.layout} (Campaign: ${l.campaignId}, Published: ${l.published ? 'Yes' : 'No'})`);
    });

    // Find Test Layout A (we know it exists)
    const testLayoutA = layouts.find(l => l.layout === 'Test Layout A');

    if (testLayoutA) {
      console.log(`\n✅ Found "Test Layout A" (ID: ${testLayoutA.layoutId}, Campaign: ${testLayoutA.campaignId})`);

      // Schedule it
      console.log('\nStep 4: Scheduling Test Layout A on test_pwa...');
      const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          eventTypeId: 1,
          campaignId: testLayoutA.campaignId,
          displayGroupIds: [testPwaDisplay.displayGroupId],
          isPriority: 0,
          fromDt: '2026-02-03 00:00:00',
          toDt: '2026-02-10 23:59:59'
        },
        ignoreHTTPSErrors: true
      });

      if (scheduleResp.ok()) {
        const result = await scheduleResp.json();
        console.log(`✅ Schedule created (Event ID: ${result.eventId || 'N/A'})`);
        console.log('✅ Test Layout A is now scheduled on test_pwa\n');
      } else {
        const error = await scheduleResp.text();
        console.log(`⚠️  Schedule creation failed: ${scheduleResp.status()}`);
        console.log(`   Error: ${error.substring(0, 200)}\n`);
      }
    }

    // Step 5: Trigger collection via CMS UI
    console.log('Step 5: Triggering collection via CMS UI...');
    await page.goto(`${CMS_URL}/login`);

    const usernameField = page.locator('input[name="username"]');
    if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usernameField.fill('xibo_admin');
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
      console.log('✅ Logged into CMS UI\n');
    }

    await page.goto(`${CMS_URL}/display/view`);
    await page.waitForTimeout(3000);

    // Find and click on test_pwa
    const displayRow = page.locator(`text=test_pwa`).first();
    if (await displayRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await displayRow.click();
      await page.waitForTimeout(3000);

      await page.screenshot({ path: './screenshots/e2e-01-display-page.png', fullPage: true });

      // Look for Collect Now button
      const collectBtn = page.getByRole('button', { name: /collect now/i }).or(
        page.locator('button:has-text("Collect")')
      ).first();

      if (await collectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Clicking "Collect Now"...');
        await collectBtn.click();
        await page.waitForTimeout(3000);
        console.log('✅ Collection triggered\n');
      } else {
        console.log('⚠️  Collect Now button not found\n');
        console.log('   Player will collect on next XMDS cycle (5-10 min)');
        console.log('   Or you can click manually in CMS\n');
      }
    }

    // Step 6: Load player and verify
    console.log('Step 6: Loading player...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');

    console.log('Waiting 45 seconds for collection and playback...\n');
    await page.waitForTimeout(45000);

    const finalState = await page.evaluate(() => ({
      url: window.location.href,
      isPlaying: !window.location.href.includes('setup.html'),
      hasXLR: typeof window.xlr !== 'undefined',
      displayName: window.xlr?.config?.displayName,
      bodyText: document.body.innerText.substring(0, 300),
      hasImage: document.querySelector('img.media') !== null,
      hasVideo: document.querySelector('video.media') !== null,
      hasAudio: document.querySelector('audio') !== null,
      hasAudioVisual: document.querySelector('.audio-visual') !== null,
      hasPDF: document.querySelector('.pdf-container') !== null,
      pageIndicator: document.querySelector('.pdf-page-indicator')?.textContent || null
    }));

    console.log('═══════════════════════════════════════════════════════════');
    console.log('PLAYER STATE');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Mode: ${finalState.isPlaying ? '✅ PLAYING' : '⚠️  SETUP'}`);
    console.log(`XLR: ${finalState.hasXLR ? '✅ Loaded' : '❌ Not loaded'}`);
    console.log(`Display: ${finalState.displayName || 'N/A'}\n`);

    console.log('Content:');
    console.log(`   Images: ${finalState.hasImage ? '✅' : '❌'}`);
    console.log(`   Videos: ${finalState.hasVideo ? '✅' : '❌'}`);
    console.log(`   Audio: ${finalState.hasAudio ? '✅' : '❌'} (Visual: ${finalState.hasAudioVisual ? '✅' : '❌'})`);
    console.log(`   PDF: ${finalState.hasPDF ? '✅' : '❌'} (Indicator: ${finalState.pageIndicator || 'None'})\n`);

    console.log('Preview:');
    console.log(finalState.bodyText);
    console.log('');

    await page.screenshot({ path: './screenshots/e2e-01-final-player.png', fullPage: true });

    if (finalState.hasAudio && finalState.hasAudioVisual) {
      console.log('🎵 ✅ AUDIO WIDGET WORKING!');
    }

    if (finalState.hasPDF && finalState.pageIndicator) {
      console.log(`📄 ✅ MULTI-PAGE PDF WORKING! (${finalState.pageIndicator})`);
    }

    console.log('\n✅ E2E-01 TEST COMPLETE');

    expect(finalState.isPlaying, 'Player should be in playback mode').toBeTruthy();
  });

});
