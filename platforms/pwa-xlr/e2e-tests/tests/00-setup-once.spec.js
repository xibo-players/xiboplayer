const { test } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

// Working configuration
const PLAYER_CONFIG = {
  cmsAddress: "https://displays.superpantalles.com",
  cmsKey: "isiSdUCy",
  displayName: "test_pwa",
  hardwareKey: "000000000000000000000000093dc477",
  xmrChannel: "794ef61c-f55e-4752-89a7-a3857db653db"
};

test('00-SETUP: Configure player (run once)', async ({ page, context }) => {
  console.log('\n=== ONE-TIME PLAYER SETUP ===\n');

  // Go to domain and set config
  await page.goto('https://displays.superpantalles.com/');

  await page.evaluate((config) => {
    localStorage.setItem('xibo_config', JSON.stringify(config));
  }, PLAYER_CONFIG);

  console.log('✅ Player configured with credentials');
  console.log('   Display: test_pwa');
  console.log('   This configuration will be reused by all tests');

  // Save the storage state for reuse
  await context.storageState({ path: 'playwright/.auth/player-auth.json' });

  console.log('\n✅ Authentication state saved');
  console.log('   All subsequent tests will use these credentials automatically\n');
});
