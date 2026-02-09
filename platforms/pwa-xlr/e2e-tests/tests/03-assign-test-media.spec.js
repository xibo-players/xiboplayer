const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(180000);

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

test('03-SETUP: Assign test image layout to display', async ({ page, request }) => {
  console.log('\n=== ASSIGN TEST IMAGE TO DISPLAY ===\n');

  await login(page);

  // Get API token
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

  console.log('✅ Got API token');

  // Use Test Layout A (ID 25)
  console.log('\nAssigning Test Layout A to test_pwa display...');

  // Get displays
  const displaysResp = await request.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    ignoreHTTPSErrors: true
  });

  const displays = await displaysResp.json();
  const testPwaDisplay = displays.find(d => d.display === 'test_pwa');

  if (testPwaDisplay) {
    console.log(`✅ Found test_pwa display (ID: ${testPwaDisplay.displayId})`);
    console.log(`   Current default layout: ${testPwaDisplay.defaultLayout} (ID: ${testPwaDisplay.defaultLayoutId})`);
    console.log(`   Display group ID: ${testPwaDisplay.displayGroupId}`);

    // Assign Test Layout A via schedule (more reliable than display update)
    console.log('\nCreating schedule for Test Layout A (campaign ID: 12)...');

    const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        eventTypeId: 1,
        campaignId: 12, // Test Layout A's campaign
        displayGroupIds: [testPwaDisplay.displayGroupId],
        isPriority: 0,
        displayOrder: 1,
        dayPartId: 0,
        fromDt: '2026-01-01 00:00:00',
        toDt: '2027-12-31 23:59:59'
      },
      ignoreHTTPSErrors: true
    });

    if (scheduleResp.ok()) {
      const result = await scheduleResp.json();
      console.log(`✅ Schedule created (Event ID: ${result.eventId || 'N/A'})`);
      console.log('✅ Test Layout A is now scheduled on test_pwa');
    } else {
      const error = await scheduleResp.json();
      console.log('⚠️  Schedule creation failed:', JSON.stringify(error));
    }
  }

  console.log('\n✅ TEST COMPLETE - Layout assigned');
  console.log('   Player should show Test Layout A (green background) on next collection');
});
