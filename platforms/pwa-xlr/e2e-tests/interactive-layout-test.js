#!/usr/bin/env node
/**
 * Interactive Layout Testing
 * Keeps player open, schedules each layout, and monitors changes
 */

const { chromium, request } = require('@playwright/test');
const readline = require('readline');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

const TEST_LAYOUTS = [
  { name: 'Test Layout A', id: 25, campaignId: 12, bg: '#c2e22c', desc: 'Green/Yellow' },
  { name: 'Test Layout B', id: 22, campaignId: 13, bg: '#d02c2c', desc: 'Red' },
  { name: 'Test Layout C', id: 24, campaignId: 14, bg: '#22e2c7', desc: 'Cyan/Turquoise' }
];

let browser, page, apiCtx, apiToken;

async function setupAPI() {
  apiCtx = await request.newContext({ ignoreHTTPSErrors: true });
  const tokenResp = await apiCtx.post(`${CMS_URL}/api/authorize/access_token`, {
    form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  });
  const { access_token } = await tokenResp.json();
  apiToken = access_token;
  console.log('✓ API connected\n');
}

async function setupPlayer() {
  console.log('Opening player browser window...');
  browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    storageState: 'playwright/.auth/player-auth.json',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });

  page = await context.newPage();

  console.log('Loading player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  console.log('✓ Player loaded and visible\n');
}

async function scheduleLayout(layout) {
  console.log(`\nScheduling ${layout.name} (${layout.desc} background)...`);

  const scheduleResp = await apiCtx.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,
      campaignId: layout.campaignId,
      displayGroupIds: [29],  // test_pwa
      isPriority: 1,  // High priority
      displayOrder: 1,
      dayPartId: 0,
      fromDt: new Date().toISOString().substring(0, 19).replace('T', ' '),
      toDt: '2026-02-03 23:59:59'
    }
  });

  if (scheduleResp.ok()) {
    const result = await scheduleResp.json();
    console.log(`✓ Scheduled (Event ID: ${result.eventId || 'N/A'})`);
    return true;
  } else {
    const error = await scheduleResp.json();
    console.log(`✗ Failed: ${error.message}`);
    return false;
  }
}

async function monitorLayout(layout, duration = 60000) {
  console.log(`\nMonitoring for ${duration/1000}s...`);
  console.log(`Looking for ${layout.desc} background (${layout.bg})`);

  const startTime = Date.now();
  let lastBg = null;

  while (Date.now() - startTime < duration) {
    const state = await page.evaluate(() => ({
      bg: window.getComputedStyle(document.body).backgroundColor,
      text: document.body.innerText.substring(0, 100)
    }));

    if (state.bg !== lastBg) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`  [${elapsed}s] Background: ${state.bg}`);
      lastBg = state.bg;

      // Take screenshot on change
      await page.screenshot({
        path: `./screenshots/monitor-${layout.name.replace(/ /g, '-')}-${elapsed}s.png`
      });
    }

    await page.waitForTimeout(2000);  // Check every 2s
  }

  const finalBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  console.log(`\nFinal background: ${finalBg}`);

  return finalBg;
}

async function askToContinue(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`\n${message} (press Enter to continue): `, () => {
      rl.close();
      resolve();
    });
  });
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     INTERACTIVE LAYOUT TESTING                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await setupAPI();
  await setupPlayer();

  console.log('Player is now open and running.');
  console.log('You should see content displaying in the browser window.\n');

  for (const layout of TEST_LAYOUTS) {
    console.log('\n' + '='.repeat(80));
    console.log(`TEST: ${layout.name}`);
    console.log('='.repeat(80));

    await askToContinue(`Ready to schedule ${layout.name}?`);

    await scheduleLayout(layout);

    console.log('\nWatching player for layout change...');
    console.log('(Player collection interval may take 30-60 seconds)');

    const finalBg = await monitorLayout(layout, 60000);

    console.log(`\n${layout.name} test complete.`);
    await page.screenshot({
      path: `./screenshots/final-${layout.name.replace(/ /g, '-')}.png`
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('ALL LAYOUTS TESTED');
  console.log('='.repeat(80));

  await askToContinue('Press Enter to close browser and finish');

  await apiCtx.dispose();
  await browser.close();

  console.log('\n=== DONE ===\n');
})();
