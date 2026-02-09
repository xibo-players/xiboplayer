#!/usr/bin/env node
/**
 * Assign Test Layout A (ID: 25) to test_pwa display
 * Uses schedule/campaign approach which is more reliable
 */

const { request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

(async () => {
  console.log('\n=== ASSIGN TEST LAYOUT A TO test_pwa ===\n');

  const ctx = await request.newContext({ ignoreHTTPSErrors: true });

  // Get token
  console.log('Getting API token...');
  const tokenResp = await ctx.post(`${CMS_URL}/api/authorize/access_token`, {
    form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  });
  const { access_token } = await tokenResp.json();
  console.log('✓ Got token\n');

  // Get test_pwa display
  console.log('Getting test_pwa display info...');
  const displaysResp = await ctx.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const displays = await displaysResp.json();
  const testPwa = displays.find(d => d.display === 'test_pwa');

  if (!testPwa) {
    console.log('❌ test_pwa display not found!');
    process.exit(1);
  }

  console.log(`✓ Found: ${testPwa.display} (ID: ${testPwa.displayId})`);
  console.log(`  Current default: ${testPwa.defaultLayout} (ID: ${testPwa.defaultLayoutId})`);
  console.log(`  Display group ID: ${testPwa.displayGroupId}\n`);

  // Approach: Assign layout directly to the display's display group via schedule
  console.log('Creating "Always On" schedule for Test Layout A...');

  const scheduleResp = await ctx.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,
      campaignId: 12, // Test Layout A's campaign ID
      displayGroupIds: [testPwa.displayGroupId],
      isPriority: 0,
      displayOrder: 1,
      dayPartId: 0,
      fromDt: '2026-01-01 00:00:00',  // Start date
      toDt: '2027-12-31 23:59:59'      // End date
    }
  });

  console.log('Schedule API status:', scheduleResp.status());

  if (scheduleResp.ok()) {
    const result = await scheduleResp.json();
    console.log('✅ Schedule created!');
    console.log(`   Event ID: ${result.eventId || 'N/A'}`);
    console.log('\n✅ Test Layout A is now scheduled on test_pwa!');
    console.log('   Player will show it on next collection cycle');
  } else {
    const error = await scheduleResp.json();
    console.log('❌ Schedule creation failed:');
    console.log(JSON.stringify(error, null, 2));
  }

  await ctx.dispose();
  console.log('\n=== DONE ===\n');
  process.exit(scheduleResp.ok() ? 0 : 1);
})();
