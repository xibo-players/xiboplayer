#!/usr/bin/env node
const { request } = require('@playwright/test');

const CMS_URL = 'https://displays.superpantalles.com';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

(async () => {
  const context = await request.newContext({ ignoreHTTPSErrors: true });

  // Get token
  const tokenResp = await context.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }
  });
  const { access_token } = await tokenResp.json();

  // Get displays
  const displaysResp = await context.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  const displays = await displaysResp.json();
  const testPwa = displays.find(d => d.display === 'test_pwa');

  console.log('test_pwa display fields:');
  console.log(JSON.stringify(testPwa, null, 2));

  await context.dispose();
})();
