#!/usr/bin/env node
/**
 * Automated Layout Testing - No user input required
 * Keeps player open, schedules layouts, monitors changes
 */

const { chromium, request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

const TEST_LAYOUTS = [
  { name: 'Test Layout A', id: 25, campaignId: 12, bg: '#c2e22c', rgb: 'rgb(194, 226, 44)', desc: 'Green/Yellow' },
  { name: 'Test Layout B', id: 22, campaignId: 13, bg: '#d02c2c', rgb: 'rgb(208, 44, 44)', desc: 'Red' },
  { name: 'Test Layout C', id: 24, campaignId: 14, bg: '#22e2c7', rgb: 'rgb(34, 226, 199)', desc: 'Cyan' }
];

let apiCtx, apiToken, page;

async function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

async function setupAPI() {
  apiCtx = await request.newContext({ ignoreHTTPSErrors: true });
  const tokenResp = await apiCtx.post(`${CMS_URL}/api/authorize/access_token`, {
    form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  });
  const { access_token } = await tokenResp.json();
  apiToken = access_token;
}

async function setupPlayer() {
  await log('Opening player browser window...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    storageState: 'playwright/.auth/player-auth.json',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });

  page = await context.newPage();

  await log('Loading player...');
  await page.goto('https://displays.superpantalles.com/player/xlr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  await log('✓ Player loaded and visible\n');
  return browser;
}

async function scheduleLayout(layout, priority, startOffset = 0) {
  const now = new Date();
  now.setSeconds(now.getSeconds() + startOffset);
  const fromDt = now.toISOString().substring(0, 19).replace('T', ' ');

  await log(`Scheduling ${layout.name} (${layout.desc}) with priority ${priority}...`);

  const scheduleResp = await apiCtx.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,  // Layout event
      campaignId: layout.campaignId,
      displayGroupIds: [29],
      isPriority: priority,
      displayOrder: 1,
      dayPartId: 0,
      fromDt: fromDt,
      toDt: '2026-02-03 23:59:59'
    }
  });

  if (scheduleResp.ok()) {
    const result = await scheduleResp.json();
    await log(`  ✓ Event ID: ${result.eventId || 'N/A'}`);
    return true;
  } else {
    const error = await scheduleResp.json();
    await log(`  ✗ Failed: ${error.message}`);
    return false;
  }
}

async function getPlayerBackground() {
  return await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
}

async function monitorForChange(layout, maxWaitSec = 90) {
  await log(`Monitoring for ${layout.desc} background (${maxWaitSec}s)...`);
  const startBg = await getPlayerBackground();
  await log(`  Starting background: ${startBg}`);

  for (let i = 0; i < maxWaitSec; i += 5) {
    await page.waitForTimeout(5000);
    const currentBg = await getPlayerBackground();

    if (currentBg !== startBg) {
      await log(`  🎨 Background changed to: ${currentBg} at ${i+5}s`);
      await page.screenshot({
        path: `./screenshots/layout-${layout.name.replace(/ /g, '-')}-${i+5}s.png`
      });
    }

    if (currentBg === layout.rgb || currentBg.includes(layout.bg.substring(1, 4))) {
      await log(`  ✅ ${layout.name} IS SHOWING!`);
      return true;
    }

    if ((i + 5) % 15 === 0) {
      await log(`  ... ${i+5}s - still ${currentBg}`);
    }
  }

  const finalBg = await getPlayerBackground();
  await log(`  Final background: ${finalBg}`);
  return false;
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     AUTO LAYOUT TEST - PLAYER STAYS OPEN                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await setupAPI();
  await setupPlayer();

  await log('Browser window is open - you should see the player\n');

  // Test each layout
  for (let i = 0; i < TEST_LAYOUTS.length; i++) {
    const layout = TEST_LAYOUTS[i];

    console.log('\n' + '='.repeat(80));
    console.log(`TEST ${i + 1}/3: ${layout.name}`);
    console.log('='.repeat(80));

    // Schedule with high priority
    const scheduled = await scheduleLayout(layout, 10 - i);  // Decreasing priority

    if (scheduled) {
      // Monitor for changes
      const showed = await monitorForChange(layout, 90);

      await page.screenshot({
        path: `./screenshots/final-${layout.name.replace(/ /g, '-')}.png`
      });

      if (showed) {
        await log(`\n✅ ${layout.name} VERIFIED\n`);
      } else {
        await log(`\n⚠️  ${layout.name} did not display (or collection not triggered)\n`);
      }
    }

    // Small delay before next
    if (i < TEST_LAYOUTS.length - 1) {
      await log('Waiting 10s before next layout...\n');
      await page.waitForTimeout(10000);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('ALL LAYOUTS TESTED');
  console.log('='.repeat(80));
  console.log('\nBrowser will stay open for 30 seconds for final observation...');

  await page.waitForTimeout(30000);

  await apiCtx.dispose();
  await page.close();
  await (await page.context()).close();
  await (await page.context().browser()).close();

  console.log('\n=== DONE ===\n');
})();
