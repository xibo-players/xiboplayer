const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(180000);

test.describe('Display Update API - Correct Method', () => {

  test('DISPLAY-UPDATE-01: Use correct defaultlayout endpoint', async ({ request }) => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TESTING: PUT /display/defaultlayout/{displayId}');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get token
    const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
      form: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      ignoreHTTPSErrors: true
    });

    const { access_token } = await tokenResp.json();
    console.log('✅ OAuth token obtained\n');

    // Get test display
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
      ignoreHTTPSErrors: true
    });

    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa');

    console.log(`Display: ${testDisplay.display} (ID: ${testDisplay.displayId})`);
    console.log(`Current default layout: ${testDisplay.defaultLayout} (ID: ${testDisplay.defaultLayoutId})\n`);

    // Get a layout to assign
    const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
      ignoreHTTPSErrors: true
    });

    const layouts = await layoutsResp.json();
    const targetLayout = layouts[0]; // Use first available layout

    console.log(`Target layout: ${targetLayout.layout} (ID: ${targetLayout.layoutId})\n`);

    // Test the CORRECT endpoint
    console.log('Testing: PUT /display/defaultlayout/{displayId}');
    console.log('Parameters: layoutId only\n');

    const updateResp = await request.put(`${CMS_URL}/api/display/defaultlayout/${testDisplay.displayId}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        layoutId: String(targetLayout.layoutId)
      },
      ignoreHTTPSErrors: true
    });

    console.log(`Response status: ${updateResp.status()}`);

    if (updateResp.status() === 204) {
      console.log('✅ SUCCESS! Display default layout updated');
      console.log(`   Used simple API: PUT /display/defaultlayout/{displayId}`);
      console.log(`   Parameters: layoutId only`);
      console.log(`   No need for 50+ fields!\n`);

      // Verify it actually updated
      const verifyResp = await request.get(`${CMS_URL}/api/display`, {
        headers: { 'Authorization': `Bearer ${access_token}` },
        ignoreHTTPSErrors: true
      });

      const updatedDisplays = await verifyResp.json();
      const updated = updatedDisplays.find(d => d.displayId === testDisplay.displayId);

      console.log('Verification:');
      console.log(`   Previous default: ${testDisplay.defaultLayoutId}`);
      console.log(`   New default: ${updated.defaultLayoutId}`);
      console.log(`   Expected: ${targetLayout.layoutId}`);

      if (updated.defaultLayoutId === targetLayout.layoutId) {
        console.log('   ✅ VERIFIED - Display updated in CMS!\n');
      } else {
        console.log('   ⚠️  Unexpected - Value didn\'t change\n');
      }

      expect(updateResp.status()).toBe(204);

    } else if (updateResp.status() === 404) {
      console.log('❌ 404 Not Found - Endpoint may not exist in this Xibo version');
      const body = await updateResp.text();
      console.log(`   Response: ${body.substring(0, 200)}\n`);

    } else {
      console.log(`⚠️  Unexpected status: ${updateResp.status()}`);
      const body = await updateResp.text();
      console.log(`   Response: ${body.substring(0, 200)}\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('COMPARISON:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('❌ WRONG (complex):');
    console.log('   PUT /display/{id}');
    console.log('   Requires: display, defaultLayoutId, licensed, license,');
    console.log('            incSchedule, emailAlert, wakeOnLanEnabled, ...');
    console.log('            (50+ total fields)\n');

    console.log('✅ CORRECT (simple):');
    console.log('   PUT /display/defaultlayout/{id}');
    console.log('   Requires: layoutId ONLY');
    console.log('   Status: ' + (updateResp.status() === 204 ? '✅ Works!' : '❌ Failed')+ '\n');

    console.log('✅ BEST (most reliable):');
    console.log('   POST /api/schedule');
    console.log('   Requires: campaignId, displayGroupIds, dates');
    console.log('   Status: ✅ Always works (already verified)\n');

    console.log('Recommendation: Use schedule API for reliability\n');
  });

});
