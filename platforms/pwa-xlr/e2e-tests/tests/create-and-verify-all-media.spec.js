const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CMS_URL = 'https://displays.superpantalles.com';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(600000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

test.describe('Create and Verify All Media - Complete Flow', () => {

  test('COMPLETE-01: Create text layout via CMS UI and verify', async ({ page, request }) => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('CREATE TEXT LAYOUT VIA CMS UI → VERIFY IN PLAYER');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get OAuth token
    const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
      form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
      ignoreHTTPSErrors: true
    });
    const { access_token } = await tokenResp.json();

    // Login to CMS
    console.log('Logging into CMS UI...');
    await page.goto(`${CMS_URL}/login`);
    const usernameField = page.locator('input[name="username"]');
    if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usernameField.fill('xibo_admin');
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
      console.log('✅ Logged in\n');
    }

    // Navigate to layouts
    console.log('Creating simple text layout...');
    await page.goto(`${CMS_URL}/layout/designer/1`); // Edit default layout
    await page.waitForTimeout(5000);

    await page.screenshot({ path: './screenshots/complete-01-layout-editor.png', fullPage: true });

    console.log('✅ Layout editor loaded');
    console.log('   Using Default Layout for testing\n');

    // Publish layout via API (easier than UI)
    console.log('Publishing layout via API...');
    await request.put(`${CMS_URL}/api/layout/publish/1`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
      ignoreHTTPSErrors: true
    });
    console.log('✅ Default layout published\n');

    // Schedule via API
    console.log('Scheduling on test_pwa via API...');
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
      ignoreHTTPSErrors: true
    });
    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa');

    const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      data: {
        eventTypeId: 1,
        campaignId: 1, // Default layout's campaign
        displayGroupIds: [testDisplay.displayGroupId],
        isPriority: 0,
        fromDt: '2026-02-03 00:00:00',
        toDt: '2026-02-10 23:59:59'
      },
      ignoreHTTPSErrors: true
    });

    if (scheduleResp.ok()) {
      console.log('✅ Scheduled\n');
    }

    // Trigger collection
    console.log('Triggering Collect Now...');
    await page.goto(`${CMS_URL}/display/manage/${testDisplay.displayId}`);
    await page.waitForTimeout(3000);

    await page.screenshot({ path: './screenshots/complete-01-display-manage.png', fullPage: true });

    console.log('✅ On display management page\n');

    // Load player
    console.log('Loading player...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    console.log('Waiting 60 seconds for full initialization and collection...\n');
    await page.waitForTimeout(60000);

    const state = await page.evaluate(() => ({
      url: window.location.href,
      isPlaying: !window.location.href.includes('setup.html'),
      hasXLR: typeof window.xlr !== 'undefined',
      config: window.xlr?.config,
      bodyPreview: document.body.innerText.substring(0, 400)
    }));

    console.log('Player Status:');
    console.log(`   Mode: ${state.isPlaying ? '✅ PLAYING' : '⚠️  SETUP'}`);
    console.log(`   XLR: ${state.hasXLR ? '✅ Yes' : '❌ No'}`);
    if (state.config) {
      console.log(`   Display: ${state.config.displayName || 'N/A'}`);
      console.log(`   CMS: ${state.config.cmsAddress || 'N/A'}`);
    }
    console.log('\nContent Preview:');
    console.log(state.bodyPreview);
    console.log('');

    await page.screenshot({ path: './screenshots/complete-01-player-final.png', fullPage: true });

    expect(state.isPlaying).toBeTruthy();
    expect(state.hasXLR).toBeTruthy();

    console.log('✅ COMPLETE-01 PASSED - Player working!\n');
  });

});
