#!/usr/bin/env node

import { XiboCmsClient } from './xibo-api-client.js';

/**
 * Verify CMS schedule and display player status
 */

async function verify() {
  console.log('\n🔍 Verifying player configuration...\n');

  const client = new XiboCmsClient();

  try {
    await client.authenticate();

    // Get display group
    const testGroupName = process.env.TEST_DISPLAY_GROUP || 'Test Displays';
    const testGroup = await client.getDisplayGroupByName(testGroupName);

    if (!testGroup) {
      console.error(`❌ Display group "${testGroupName}" not found`);
      return;
    }

    console.log(`📺 Display Group: ${testGroup.displayGroup}`);

    // Get displays in group
    const displays = await client.getDisplaysInGroup(testGroup.displayGroupId);
    console.log(`   Displays in group: ${displays.length}`);
    displays.forEach(d => {
      console.log(`   - ${d.display} (Status: ${d.loggedIn ? 'Online' : 'Offline'})`);
    });

    // Get schedule
    console.log('\n📅 Schedule for display group:');
    const schedule = await client.getSchedule(testGroup.displayGroupId);

    if (schedule && schedule.length > 0) {
      schedule.forEach((event, idx) => {
        console.log(`\n   Event ${idx + 1}:`);
        console.log(`   - Campaign: ${event.campaign || event.layoutId}`);
        console.log(`   - From: ${event.fromDt}`);
        console.log(`   - To: ${event.toDt}`);
        console.log(`   - Priority: ${event.isPriority}`);
        if (event.recurrenceType) {
          console.log(`   - Recurrence: ${event.recurrenceType} (${event.recurrenceDetail})`);
        }
      });
    } else {
      console.log('   ⚠️  No scheduled events found');
    }

    // Get campaigns
    console.log('\n📁 Test Campaigns:');
    const campaigns = await client.getCampaigns();
    const testCampaigns = campaigns.filter(c => c.campaign.includes('Test') || c.campaign.includes('Automated'));

    testCampaigns.forEach(c => {
      console.log(`   - ${c.campaign} (ID: ${c.campaignId}, Layouts: ${c.numberLayouts})`);
    });

    console.log('\n✅ Verification complete!');
    console.log(`\n🌐 Open player: ${client.cmsUrl}/player/`);

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verify().catch(console.error);
