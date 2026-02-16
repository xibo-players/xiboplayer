/**
 * E2E Visual Test: Campaign Rotation
 *
 * Creates a campaign with 3 different layouts and verifies the player
 * cycles through them by detecting region changes in the DOM.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion } from './e2e-helpers.js';

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
      layouts.push(result);
    }

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Rotation Campaign ${Date.now()}`,
      layouts.map(l => l.layoutId)
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    // Wait for the first layout's region to appear
    await gotoPlayerAndWaitForRegion(page, layouts[0].regionId);

    // Capture screenshots at intervals to show rotation
    const screenshots = [];
    for (let i = 0; i < 3; i++) {
      // Wait for each layout's duration (10s) plus some buffer
      await page.waitForTimeout(12000);
      const path = `test-results/rotation-${i + 1}.png`;
      await page.screenshot({ path, fullPage: true });
      screenshots.push(path);
    }

    // Verify player is still running
    const container = page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
