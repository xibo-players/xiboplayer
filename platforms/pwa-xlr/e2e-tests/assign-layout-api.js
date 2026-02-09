#!/usr/bin/env node
/**
 * Assign layout to display using proper API calls
 */

const { request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

(async () => {
  console.log('\n=== ASSIGN LAYOUT TO DISPLAY (API) ===\n');

  const ctx = await request.newContext({ ignoreHTTPSErrors: true });

  try {
    // Step 1: Get token
    console.log('Step 1: Getting API token...');
    const tokenResp = await ctx.post(`${CMS_URL}/api/authorize/access_token`, {
      form: { grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
    });
    const { access_token } = await tokenResp.json();
    console.log('✓ Got token');

    // Step 2: Get display details
    console.log('\nStep 2: Getting display details...');
    const displayResp = await ctx.get(`${CMS_URL}/api/display/45`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const display = await displayResp.json();
    console.log(`✓ Display: ${display.display}`);
    console.log(`  Current default layout: ${display.defaultLayout} (ID: ${display.defaultLayoutId})`);

    // Step 3: Try PATCH instead of PUT (partial update)
    console.log('\nStep 3: Assigning Test Layout A (ID: 25) using PATCH...');
    const patchResp = await ctx.patch(`${CMS_URL}/api/display/45`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      data: {
        defaultLayoutId: 25
      }
    });

    console.log('PATCH Response status:', patchResp.status());

    if (patchResp.ok()) {
      console.log('✅ SUCCESS via PATCH!');
    } else {
      const error = await patchResp.json().catch(() => patchResp.text());
      console.log('PATCH failed:', JSON.stringify(error, null, 2));

      // Step 4: Try full PUT with all fields
      console.log('\nStep 4: Trying full PUT with all required fields...');
      const putResp = await ctx.put(`${CMS_URL}/api/display/45`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
          display: display.display,
          description: display.description || '',
          defaultLayoutId: 25,
          license: display.license,
          licensed: display.licensed,
          incSchedule: display.incSchedule,
          emailAlert: display.emailAlert,
          alertTimeout: display.alertTimeout || 0,
          wakeOnLanEnabled: display.wakeOnLanEnabled || 0,
          wakeOnLanTime: display.wakeOnLanTime || '',
          broadCastAddress: display.broadCastAddress || '',
          secureOn: display.secureOn || '',
          cidr: display.cidr || '',
          latitude: display.latitude || '',
          longitude: display.longitude || '',
          displayProfileId: display.displayProfileId || 0
        }
      });

      console.log('PUT Response status:', putResp.status());

      if (putResp.ok()) {
        console.log('✅ SUCCESS via PUT!');
      } else {
        const putError = await putResp.json().catch(() => putResp.text());
        console.log('PUT failed:', JSON.stringify(putError, null, 2));
      }
    }

    // Step 5: Verify the change
    console.log('\nStep 5: Verifying assignment...');
    const verifyResp = await ctx.get(`${CMS_URL}/api/display/45`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const updated = await verifyResp.json();
    console.log(`\nFinal state:`);
    console.log(`  Default layout: ${updated.defaultLayout} (ID: ${updated.defaultLayoutId})`);

    if (updated.defaultLayoutId === 25) {
      console.log('\n✅ ASSIGNMENT SUCCESSFUL!');
    } else {
      console.log('\n⚠️  Assignment did not take effect');
      console.log(`   Expected: 25, Got: ${updated.defaultLayoutId}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await ctx.dispose();
  }

  console.log('\n=== DONE ===\n');
})();
