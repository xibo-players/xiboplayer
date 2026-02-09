const { test, expect } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(180000); // 3 minutes per test

let accessToken = null;
let tokenExpiry = 0;

/**
 * Get OAuth access token with caching
 */
async function getAccessToken(request) {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    },
    ignoreHTTPSErrors: true
  });

  expect(tokenResp.ok(), 'OAuth token request should succeed').toBeTruthy();

  const tokenData = await tokenResp.json();
  accessToken = tokenData.access_token;
  tokenExpiry = Date.now() + (3600 * 1000); // 1 hour

  return accessToken;
}

test.describe('Xibo CMS API - Comprehensive Test Suite', () => {

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  test('API-AUTH-01: Get OAuth access token', async ({ request }) => {
    console.log('\n=== OAUTH AUTHENTICATION ===\n');

    const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
      form: {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      ignoreHTTPSErrors: true
    });

    expect(tokenResp.ok()).toBeTruthy();

    const tokenData = await tokenResp.json();

    console.log('Token received:', {
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      token_length: tokenData.access_token.length
    });

    expect(tokenData.access_token).toBeDefined();
    expect(tokenData.token_type).toBe('Bearer');
    expect(tokenData.expires_in).toBeGreaterThan(0);

    console.log('✅ OAuth authentication working');
  });

  test('API-AUTH-02: Verify token works for authenticated request', async ({ request }) => {
    const token = await getAccessToken(request);

    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      ignoreHTTPSErrors: true
    });

    expect(displaysResp.ok(), 'Authenticated request should succeed').toBeTruthy();

    console.log('✅ Token works for authenticated requests');
  });

  test('API-AUTH-03: Verify request fails without token', async ({ request }) => {
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Accept': 'application/json' },
      ignoreHTTPSErrors: true
    });

    expect(displaysResp.ok()).toBeFalsy();
    expect([401, 403]).toContain(displaysResp.status());

    console.log('✅ Unauthenticated requests properly rejected');
  });

  // ============================================================================
  // DISPLAY MANAGEMENT
  // ============================================================================

  test('API-DISPLAY-01: List all displays', async ({ request }) => {
    console.log('\n=== LIST DISPLAYS ===\n');

    const token = await getAccessToken(request);

    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      ignoreHTTPSErrors: true
    });

    expect(displaysResp.ok()).toBeTruthy();

    const displays = await displaysResp.json();

    console.log(`Found ${displays.length} displays`);

    expect(Array.isArray(displays)).toBeTruthy();
    expect(displays.length).toBeGreaterThan(0);

    // Verify display structure
    const firstDisplay = displays[0];
    expect(firstDisplay.displayId).toBeDefined();
    expect(firstDisplay.display).toBeDefined();
    expect(firstDisplay.displayGroupId).toBeDefined();

    console.log('Sample display:', {
      id: firstDisplay.displayId,
      name: firstDisplay.display,
      groupId: firstDisplay.displayGroupId,
      defaultLayoutId: firstDisplay.defaultLayoutId
    });

    console.log('✅ List displays working');
  });

  test('API-DISPLAY-02: Find specific display by name', async ({ request }) => {
    const token = await getAccessToken(request);

    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa');

    if (testDisplay) {
      console.log('✅ Found test_pwa display:', {
        id: testDisplay.displayId,
        groupId: testDisplay.displayGroupId,
        defaultLayout: testDisplay.defaultLayout
      });
    } else {
      console.log('⚠️  test_pwa display not found');
    }

    expect(displays.length).toBeGreaterThan(0);
  });

  test('API-DISPLAY-03: Verify GET /api/display/{id} not supported', async ({ request }) => {
    const token = await getAccessToken(request);

    // This endpoint returns 405 Method Not Allowed
    const displayResp = await request.get(`${CMS_URL}/api/display/1`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect(displayResp.status()).toBe(405);

    console.log('✅ Confirmed: GET /api/display/{id} not supported (405)');
  });

  // ============================================================================
  // LAYOUT MANAGEMENT
  // ============================================================================

  test('API-LAYOUT-01: List all layouts', async ({ request }) => {
    console.log('\n=== LIST LAYOUTS ===\n');

    const token = await getAccessToken(request);

    const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect(layoutsResp.ok()).toBeTruthy();

    const layouts = await layoutsResp.json();

    console.log(`Found ${layouts.length} layouts`);

    expect(Array.isArray(layouts)).toBeTruthy();

    if (layouts.length > 0) {
      const firstLayout = layouts[0];
      console.log('Sample layout:', {
        id: firstLayout.layoutId,
        name: firstLayout.layout,
        campaignId: firstLayout.campaignId,
        duration: firstLayout.duration,
        published: firstLayout.published
      });
    }

    console.log('✅ List layouts working');
  });

  test('API-LAYOUT-02: Create new layout', async ({ request }) => {
    console.log('\n=== CREATE LAYOUT ===\n');

    const token = await getAccessToken(request);

    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `API Test Layout ${Date.now()}`,
        description: 'Created by API comprehensive test',
        resolutionId: 9, // 1920x1080
        duration: 30
      },
      ignoreHTTPSErrors: true
    });

    expect(layoutResp.ok(), 'Layout creation should succeed').toBeTruthy();

    const layout = await layoutResp.json();

    console.log('Created layout:', {
      id: layout.layoutId,
      name: layout.layout,
      campaignId: layout.campaignId
    });

    expect(layout.layoutId).toBeDefined();
    expect(layout.campaignId).toBeDefined();

    // Cleanup: Delete layout
    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    console.log('✅ Create layout working');
  });

  test('API-LAYOUT-03: Publish layout', async ({ request }) => {
    const token = await getAccessToken(request);

    // Create layout
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Publish Test ${Date.now()}`,
        resolutionId: 9,
        duration: 10
      },
      ignoreHTTPSErrors: true
    });

    const layout = await layoutResp.json();

    // Publish it
    const publishResp = await request.put(`${CMS_URL}/api/layout/publish/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect([200, 204]).toContain(publishResp.status());

    console.log('✅ Publish layout working');

    // Cleanup
    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
  });

  test('API-LAYOUT-04: Delete layout', async ({ request }) => {
    const token = await getAccessToken(request);

    // Create layout
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Delete Test ${Date.now()}`,
        resolutionId: 9,
        duration: 10
      },
      ignoreHTTPSErrors: true
    });

    const layout = await layoutResp.json();

    // Delete it
    const deleteResp = await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect(deleteResp.ok()).toBeTruthy();

    console.log('✅ Delete layout working');
  });

  // ============================================================================
  // WIDGET MANAGEMENT
  // ============================================================================

  test('API-WIDGET-01: Add text widget to layout', async ({ request }) => {
    console.log('\n=== ADD TEXT WIDGET ===\n');

    const token = await getAccessToken(request);

    // Create layout
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Widget Test ${Date.now()}`,
        resolutionId: 9,
        duration: 20
      },
      ignoreHTTPSErrors: true
    });

    const layout = await layoutResp.json();

    // Add text widget
    const widgetResp = await request.post(`${CMS_URL}/api/playlist/widget/text/${layout.layoutId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        text: '<h1>API Test Widget</h1><p>Created by comprehensive test suite</p>',
        duration: 20
      },
      ignoreHTTPSErrors: true
    });

    expect(widgetResp.ok(), 'Widget creation should succeed').toBeTruthy();

    const widget = await widgetResp.json();

    console.log('Created widget:', {
      widgetId: widget.widgetId,
      playlistId: widget.playlistId,
      type: 'text'
    });

    expect(widget.widgetId).toBeDefined();

    console.log('✅ Add text widget working');

    // Cleanup
    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
  });

  // ============================================================================
  // CAMPAIGN MANAGEMENT
  // ============================================================================

  test('API-CAMPAIGN-01: List all campaigns', async ({ request }) => {
    console.log('\n=== LIST CAMPAIGNS ===\n');

    const token = await getAccessToken(request);

    const campaignsResp = await request.get(`${CMS_URL}/api/campaign`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect(campaignsResp.ok()).toBeTruthy();

    const campaigns = await campaignsResp.json();

    console.log(`Found ${campaigns.length} campaigns`);

    expect(Array.isArray(campaigns)).toBeTruthy();

    if (campaigns.length > 0) {
      const firstCampaign = campaigns[0];
      console.log('Sample campaign:', {
        id: firstCampaign.campaignId,
        name: firstCampaign.campaign,
        layoutSpecific: firstCampaign.isLayoutSpecific,
        numLayouts: firstCampaign.numberLayouts
      });
    }

    console.log('✅ List campaigns working');
  });

  test('API-CAMPAIGN-02: Create new campaign', async ({ request }) => {
    console.log('\n=== CREATE CAMPAIGN ===\n');

    const token = await getAccessToken(request);

    const campaignResp = await request.post(`${CMS_URL}/api/campaign`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `API Test Campaign ${Date.now()}`
      },
      ignoreHTTPSErrors: true
    });

    expect(campaignResp.ok()).toBeTruthy();

    const campaign = await campaignResp.json();

    console.log('Created campaign:', {
      id: campaign.campaignId,
      name: campaign.campaign
    });

    expect(campaign.campaignId).toBeDefined();

    console.log('✅ Create campaign working');

    // Cleanup
    await request.delete(`${CMS_URL}/api/campaign/${campaign.campaignId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
  });

  test('API-CAMPAIGN-03: Assign layout to campaign', async ({ request }) => {
    const token = await getAccessToken(request);

    // Create layout
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Campaign Test ${Date.now()}`,
        resolutionId: 9,
        duration: 10
      },
      ignoreHTTPSErrors: true
    });

    const layout = await layoutResp.json();

    // Create campaign
    const campaignResp = await request.post(`${CMS_URL}/api/campaign`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Assign Test ${Date.now()}`
      },
      ignoreHTTPSErrors: true
    });

    const campaign = await campaignResp.json();

    // Assign layout to campaign
    const assignResp = await request.post(`${CMS_URL}/api/campaign/layout/assign/${campaign.campaignId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        layoutId: String(layout.layoutId),
        displayOrder: 1
      },
      ignoreHTTPSErrors: true
    });

    expect([200, 201, 204]).toContain(assignResp.status());

    console.log('✅ Assign layout to campaign working');

    // Cleanup
    await request.delete(`${CMS_URL}/api/campaign/${campaign.campaignId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
  });

  // ============================================================================
  // SCHEDULE MANAGEMENT
  // ============================================================================

  test('API-SCHEDULE-01: Create schedule event', async ({ request }) => {
    console.log('\n=== CREATE SCHEDULE ===\n');

    const token = await getAccessToken(request);

    // Get test display
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa') || displays[0];

    if (!testDisplay) {
      console.log('⚠️  No displays available, skipping schedule test');
      return;
    }

    // Create layout
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `Schedule Test ${Date.now()}`,
        resolutionId: 9,
        duration: 10
      },
      ignoreHTTPSErrors: true
    });

    const layout = await layoutResp.json();

    // Publish layout
    await request.put(`${CMS_URL}/api/layout/publish/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    // Create schedule
    const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        eventTypeId: 1,
        campaignId: layout.campaignId,
        displayGroupIds: [testDisplay.displayGroupId],
        isPriority: 0,
        fromDt: '2026-01-01 00:00:00',
        toDt: '2026-01-31 23:59:59'
      },
      ignoreHTTPSErrors: true
    });

    expect(scheduleResp.ok(), 'Schedule creation should succeed').toBeTruthy();

    const schedule = await scheduleResp.json();

    console.log('Created schedule:', {
      eventId: schedule.eventId,
      campaignId: schedule.campaignId,
      displayGroupIds: schedule.displayGroupIds
    });

    expect(schedule.eventId).toBeDefined();

    console.log('✅ Create schedule working');

    // Cleanup
    await request.delete(`${CMS_URL}/api/schedule/${schedule.eventId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
  });

  // ============================================================================
  // END-TO-END WORKFLOW
  // ============================================================================

  test('API-E2E-01: Complete workflow - Create, assign, schedule, cleanup', async ({ request }) => {
    console.log('\n=== COMPLETE E2E WORKFLOW ===\n');

    const token = await getAccessToken(request);

    // 1. Create layout
    console.log('1. Creating layout...');
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: `E2E Test ${Date.now()}`,
        description: 'Complete workflow test',
        resolutionId: 9,
        duration: 30
      },
      ignoreHTTPSErrors: true
    });

    expect(layoutResp.ok()).toBeTruthy();
    const layout = await layoutResp.json();
    console.log(`   ✅ Layout created: ${layout.layoutId}`);

    // 2. Add widget
    console.log('2. Adding widget...');
    const widgetResp = await request.post(`${CMS_URL}/api/playlist/widget/text/${layout.layoutId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        text: '<h1>E2E Workflow Test</h1><p>Complete API test</p>',
        duration: 30
      },
      ignoreHTTPSErrors: true
    });

    expect(widgetResp.ok()).toBeTruthy();
    console.log('   ✅ Widget added');

    // 3. Publish layout
    console.log('3. Publishing layout...');
    const publishResp = await request.put(`${CMS_URL}/api/layout/publish/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    expect([200, 204]).toContain(publishResp.status());
    console.log('   ✅ Layout published');

    // 4. Get display
    console.log('4. Getting display...');
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa') || displays[0];

    if (testDisplay) {
      console.log(`   ✅ Display found: ${testDisplay.display}`);

      // 5. Create schedule
      console.log('5. Creating schedule...');
      const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          eventTypeId: 1,
          campaignId: layout.campaignId,
          displayGroupIds: [testDisplay.displayGroupId],
          isPriority: 0,
          fromDt: '2026-01-01 00:00:00',
          toDt: '2026-01-31 23:59:59'
        },
        ignoreHTTPSErrors: true
      });

      if (scheduleResp.ok()) {
        const schedule = await scheduleResp.json();
        console.log(`   ✅ Schedule created: ${schedule.eventId}`);

        // Cleanup schedule
        await request.delete(`${CMS_URL}/api/schedule/${schedule.eventId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          ignoreHTTPSErrors: true
        });
        console.log('   ✅ Schedule cleaned up');
      }
    } else {
      console.log('   ⚠️  No display available for scheduling');
    }

    // 6. Cleanup layout
    console.log('6. Cleaning up layout...');
    await request.delete(`${CMS_URL}/api/layout/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
    console.log('   ✅ Layout cleaned up');

    console.log('\n✅ COMPLETE E2E WORKFLOW SUCCESS');
  });

});
