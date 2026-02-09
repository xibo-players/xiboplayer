#!/usr/bin/env node
/**
 * Test all 3 test layouts (A, B, C)
 * Creates high-priority schedules for each and verifies playback
 */

const { chromium, request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

const TEST_LAYOUTS = [
  { name: 'Test Layout A', id: 25, campaignId: 12, expectedBg: '#c2e22c', description: 'Green background' },
  { name: 'Test Layout B', id: 22, campaignId: 13, expectedBg: '#d02c2c', description: 'Red background' },
  { name: 'Test Layout C', id: 24, campaignId: 14, expectedBg: '#22e2c7', description: 'Cyan background' }
];

async function getApiToken() {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const tokenResp = await ctx.post(`${CMS_URL}/api/authorize/access_token`, {
    form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  });
  const { access_token } = await tokenResp.json();
  return { token: access_token, ctx };
}

async function scheduleLayout(ctx, token, layout, displayGroupId, priority) {
  console.log(`\nScheduling ${layout.name}...`);
  console.log(`  Campaign ID: ${layout.campaignId}`);
  console.log(`  Priority: ${priority}`);
  console.log(`  Expected background: ${layout.expectedBg} (${layout.description})`);

  const scheduleResp = await ctx.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,
      campaignId: layout.campaignId,
      displayGroupIds: [displayGroupId],
      isPriority: priority,
      displayOrder: 1,
      dayPartId: 0,
      fromDt: '2026-02-02 20:00:00',
      toDt: '2026-02-02 23:59:59'
    }
  });

  if (scheduleResp.ok()) {
    const result = await scheduleResp.json();
    console.log(`✓ Scheduled (Event ID: ${result.eventId || 'N/A'})`);
    return true;
  } else {
    const error = await scheduleResp.json();
    console.log(`✗ Failed:`, error.message);
    return false;
  }
}

async function testLayout(browser, layout, duration = 20000) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TESTING: ${layout.name}`);
  console.log(`Expected: ${layout.description} - ${layout.expectedBg}`);
  console.log('='.repeat(80));

  const context = await browser.newContext({
    storageState: 'playwright/.auth/player-auth.json',
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  console.log('\nLoading player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');

  console.log(`Waiting ${duration/1000}s for collection and playback...`);
  await page.waitForTimeout(duration);

  // Check state
  const state = await page.evaluate(() => ({
    background: window.getComputedStyle(document.body).backgroundColor,
    bodyText: document.body.innerText.substring(0, 200),
    url: window.location.href,
    hasXLR: !!(window.xlr || window.xlrPlayer)
  }));

  const screenshotName = `test-layout-${layout.name.replace(/ /g, '-')}.png`;
  await page.screenshot({ path: `./screenshots/${screenshotName}` });
  console.log(`✓ Screenshot: ${screenshotName}`);

  console.log('\nPlayer State:');
  console.log(`  Background: ${state.background}`);
  console.log(`  Expected: ${layout.expectedBg}`);
  console.log(`  XLR active: ${state.hasXLR}`);
  console.log(`  Content: ${state.bodyText.substring(0, 80)}...`);

  // Simple color match
  const bgMatch = state.background.includes(layout.expectedBg.substring(1)) ||
                  state.background === layout.expectedBg;

  if (bgMatch) {
    console.log(`\n✅ CORRECT LAYOUT SHOWING!`);
  } else {
    console.log(`\n⚠️  Layout might not be active yet (or showing different layout)`);
  }

  await page.close();
  await context.close();

  return { layout: layout.name, background: state.background, match: bgMatch };
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST ALL 3 LAYOUTS (A, B, C)                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const { token, ctx } = await getApiToken();
  console.log('✓ Connected to CMS API\n');

  // Get test_pwa display
  const displaysResp = await ctx.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const displays = await displaysResp.json();
  const testPwa = displays.find(d => d.display === 'test_pwa');
  const displayGroupId = testPwa.displayGroupId;

  console.log(`✓ Found test_pwa (Display Group: ${displayGroupId})\n`);

  // Schedule each layout with decreasing priority (highest first)
  console.log('═══ SCHEDULING LAYOUTS ═══');
  for (let i = 0; i < TEST_LAYOUTS.length; i++) {
    await scheduleLayout(ctx, token, TEST_LAYOUTS[i], displayGroupId, TEST_LAYOUTS.length - i);
  }

  await ctx.dispose();

  console.log('\n═══ TESTING PLAYBACK ═══\n');
  console.log('Layouts scheduled with priorities:');
  console.log('  Test Layout A: Priority 3 (highest)');
  console.log('  Test Layout B: Priority 2');
  console.log('  Test Layout C: Priority 1 (lowest)');
  console.log('\nStarting browser to test each layout...\n');

  const browser = await chromium.launch({ headless: false });
  const results = [];

  // Test each layout
  for (const layout of TEST_LAYOUTS) {
    const result = await testLayout(browser, layout, 30000);
    results.push(result);

    console.log('\nWaiting 5 seconds before next layout test...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await browser.close();

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));

  results.forEach(r => {
    const status = r.match ? '✓' : '?';
    console.log(`${status} ${r.layout}: ${r.background}`);
  });

  const allMatched = results.every(r => r.match);
  console.log(`\nResult: ${results.filter(r => r.match).length}/${results.length} layouts showed correctly`);

  console.log('\n=== DONE ===\n');
  process.exit(allMatched ? 0 : 1);
})();
