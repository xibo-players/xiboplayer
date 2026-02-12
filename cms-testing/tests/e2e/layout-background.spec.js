/**
 * E2E Visual Test: Layout Background
 *
 * Creates a layout with a colored background and verifies rendering.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';

test.describe('Layout Background Rendering', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should render a layout with custom background color', async ({ page }) => {
    if (!helper.testDisplay) {
      test.skip();
      return;
    }

    const api = helper.getApi();

    // Create layout
    const layout = await api.createLayout({
      name: `E2E Background ${Date.now()}`,
      resolutionId: helper.defaultResolutionId
    });
    helper.track('layout', layout.layoutId);

    // Set background color
    await api.editLayoutBackground(layout.layoutId, {
      backgroundColor: '#FF9800'
    });

    // Add a small text region
    const region = await api.addRegion(layout.layoutId, {
      width: 800, height: 200, top: 440, left: 560
    });

    const playlistId = region.playlists[0].playlistId;
    await api.addWidget('text', playlistId, {
      text: '<h1 style="text-align:center;color:#fff;">Orange Background Test</h1>',
      duration: 30
    });

    await api.publishLayout(layout.layoutId);

    // Schedule it
    const campaignId = await helper.createCampaignWithLayouts(
      `E2E BG Campaign ${Date.now()}`,
      [layout.layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');
    await page.waitForTimeout(10000);

    await page.screenshot({ path: 'test-results/layout-background.png', fullPage: true });

    const container = await page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
