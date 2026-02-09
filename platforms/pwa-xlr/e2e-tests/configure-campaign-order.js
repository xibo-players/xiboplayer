#!/usr/bin/env node
/**
 * Configure campaign layout order
 * Can set layouts in any order: A-B-C or C-B-A
 */

const { request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

const CAMPAIGN_ID = 15;  // Automated Test Campaign

// Configure order here: normal or reversed
const LAYOUT_ORDER = process.argv[2] === 'reverse' ? 'reverse' : 'normal';

const LAYOUTS = {
  normal: [
    { name: 'Test Layout A', id: 25 },
    { name: 'Test Layout B', id: 22 },
    { name: 'Test Layout C', id: 24 }
  ],
  reverse: [
    { name: 'Test Layout C', id: 24 },
    { name: 'Test Layout B', id: 22 },
    { name: 'Test Layout A', id: 25 }
  ]
};

async function assignLayoutToCampaign(ctx, token, campaignId, layoutId, displayOrder) {
  const assignResp = await ctx.post(`${CMS_URL}/api/campaign/layout/assign/${campaignId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      layoutId: layoutId,
      displayOrder: displayOrder
    }
  });

  return assignResp.ok();
}

async function unassignLayoutFromCampaign(ctx, token, campaignId, layoutId) {
  const unassignResp = await ctx.post(`${CMS_URL}/api/campaign/layout/unassign/${campaignId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      layoutId: layoutId
    }
  });

  return unassignResp.ok();
}

(async () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     CONFIGURE CAMPAIGN LAYOUT ORDER                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const ctx = await request.newContext({ ignoreHTTPSErrors: true });

  // Get token
  const tokenResp = await ctx.post(`${CMS_URL}/api/authorize/access_token`, {
    form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  });
  const { access_token } = await tokenResp.json();

  console.log(`Mode: ${LAYOUT_ORDER.toUpperCase()}`);
  console.log(`Campaign: Automated Test Campaign (ID: ${CAMPAIGN_ID})\n`);

  const layoutsToAssign = LAYOUTS[LAYOUT_ORDER];

  console.log('Order to configure:');
  layoutsToAssign.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.name} (ID: ${l.id})`);
  });

  console.log('\n--- Clearing existing assignments ---\n');

  // Unassign all first
  for (const layout of [25, 22, 24]) {
    const success = await unassignLayoutFromCampaign(ctx, access_token, CAMPAIGN_ID, layout);
    console.log(`Unassigned layout ${layout}: ${success ? '✓' : '✗'}`);
  }

  console.log('\n--- Assigning layouts in new order ---\n');

  // Assign in specified order
  for (let i = 0; i < layoutsToAssign.length; i++) {
    const layout = layoutsToAssign[i];
    const displayOrder = i + 1;

    console.log(`Assigning ${layout.name} as position ${displayOrder}...`);
    const success = await assignLayoutToCampaign(ctx, access_token, CAMPAIGN_ID, layout.id, displayOrder);

    if (success) {
      console.log(`  ✓ ${layout.name} assigned at position ${displayOrder}`);
    } else {
      console.log(`  ✗ Failed to assign ${layout.name}`);
    }
  }

  console.log('\n--- Verifying configuration ---\n');

  // Get campaign to verify
  const campaignsResp = await ctx.get(`${CMS_URL}/api/campaign`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const campaigns = await campaignsResp.json();
  const campaign = campaigns.find(c => c.campaignId === CAMPAIGN_ID);

  console.log('Campaign after update:');
  console.log(`  Name: ${campaign.campaign}`);
  console.log(`  Layouts: ${campaign.numberLayouts}`);
  console.log(`  Cycle enabled: ${campaign.cyclePlaybackEnabled === 1 ? 'YES' : 'NO'}`);
  console.log(`  Play order: ${campaign.listPlayOrder}`);

  console.log('\n✅ Campaign configured!');
  console.log('\nIn your player, run:');
  console.log('  window.location.reload()');
  console.log('\nYou should see layouts play in this order:');
  layoutsToAssign.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.name}`);
  });

  await ctx.dispose();

  console.log('\n=== DONE ===\n');
})();
