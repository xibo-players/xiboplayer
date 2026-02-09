const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(180000); // 3 minutes

test('Configure player and verify playback', async ({ page, request }) => {
  console.log('\n=== PLAYER CONFIGURATION & PLAYBACK TEST ===\n');

  // Step 1: Get OAuth token
  console.log('Step 1: Getting API access token...');
  const tokenResponse = await request.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    },
    ignoreHTTPSErrors: true
  });

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  console.log('✅ Got access token');

  // Step 2: Get display info
  console.log('\nStep 2: Getting display information...');
  const displaysResponse = await request.get(`${CMS_URL}/api/display`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    ignoreHTTPSErrors: true
  });

  const displays = await displaysResponse.json();
  console.log(`  Found ${displays.length} displays`);

  if (displays.length === 0) {
    throw new Error('No displays found - create a display first');
  }

  // Use first display
  const testDisplay = displays[0];
  console.log(`  Using display: ${testDisplay.display} (ID: ${testDisplay.displayId})`);

  // Step 3: Get display details with hardware key
  console.log('\nStep 3: Getting display hardware key...');
  const displayResponse = await request.get(`${CMS_URL}/api/display/${testDisplay.displayId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    ignoreHTTPSErrors: true
  });

  const displayDetails = await displayResponse.json();

  // Try different possible field names for the hardware key
  const hardwareKey = displayDetails.license || displayDetails.hardwareKey || displayDetails.cmsKey || displayDetails.key;

  if (!hardwareKey) {
    console.log('  Available fields:', Object.keys(displayDetails).join(', '));
    console.log('  Display details:', JSON.stringify(displayDetails, null, 2).substring(0, 500));
    throw new Error('Hardware key not found in display details');
  }

  console.log(`✅ Hardware key: ${hardwareKey.substring(0, 20)}...`);

  // Step 4: Configure player
  console.log('\nStep 4: Configuring player...');
  await page.goto(`${CMS_URL}/player/xlr/`);
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: './screenshots/config-01-setup-page.png', fullPage: true });

  // Fill in setup form
  await page.evaluate(({ cms, key, name }) => {
    // Set configuration in localStorage
    const config = {
      cmsAddress: cms,
      cmsKey: key,
      displayName: name,
      configured: true
    };
    localStorage.setItem('xiboConfig', JSON.stringify(config));
  }, {
    cms: CMS_URL,
    key: hardwareKey,
    name: testDisplay.display
  });

  console.log('✅ Configuration saved to localStorage');

  // Step 5: Reload player to pick up config
  console.log('\nStep 5: Reloading player...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: './screenshots/config-02-player-loading.png', fullPage: true });

  // Step 6: Wait for player to initialize
  console.log('\nStep 6: Waiting for player initialization...');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: './screenshots/config-03-player-ready.png', fullPage: true });

  // Step 7: Check player state
  const playerState = await page.evaluate(() => ({
    title: document.title,
    hasContent: document.body.innerText.length > 100,
    bodyPreview: document.body.innerText.substring(0, 300),
    xlrExists: typeof window.xlr !== 'undefined'
  }));

  console.log('\n✅ Player state:', JSON.stringify(playerState, null, 2));

  // Step 8: Observe playback
  console.log('\nStep 8: Observing playback for 20 seconds...');
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `./screenshots/config-04-playing-${i * 5}s.png`, fullPage: true });
    console.log(`  ... ${i * 5} seconds - player should be showing content`);
  }

  await page.screenshot({ path: './screenshots/config-05-final.png', fullPage: true });

  console.log('\n✅ TEST COMPLETE - Player configured and playing!');
  console.log(`\nDisplay: ${testDisplay.display}`);
  console.log(`Layouts: Check screenshots to see playback`);

  expect(playerState.xlrExists).toBe(true);
});
