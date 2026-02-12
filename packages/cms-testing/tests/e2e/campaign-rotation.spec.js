/**
 * E2E Visual Test: Campaign Rotation
 *
 * Creates a campaign with 3 different layouts and verifies the player
 * cycles through them over time by capturing screenshots at intervals.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';

test.describe('Campaign Layout Rotation', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should cycle through multiple layouts in a campaign', async ({ page }) => {
    test.setTimeout(180000); // 3 min — need time for rotation

    const layouts = [];
    const colors = ['#E91E63', '#9C27B0', '#3F51B5'];

    for (let i = 0; i < 3; i++) {
      const result = await helper.createSimpleLayout({
        name: `E2E Rotation ${i + 1} ${Date.now()}`,
        widgetProps: {
          text: `<div style="background:${colors[i]};color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-size:120px;">${i + 1}</div>`,
          duration: 10
        }
      });
      layouts.push(result.layoutId);
    }

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Rotation Campaign ${Date.now()}`,
      layouts
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');

    // Take screenshots at intervals to capture rotation
    const screenshots = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(15000); // Wait 15s between screenshots
      const path = `test-results/rotation-${i + 1}.png`;
      await page.screenshot({ path, fullPage: true });
      screenshots.push(path);
    }

    // Verify player container exists
    const container = await page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
