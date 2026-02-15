/**
 * E2E Visual Test: Priority Scheduling
 *
 * Creates two overlapping schedules with different priorities.
 * Verifies the high-priority schedule wins.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion } from './e2e-helpers.js';

test.describe('Priority Scheduling', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should display high priority layout over low priority', async ({ page }) => {
    if (!helper.testDisplay) {
      test.skip();
      return;
    }

    // Low priority layout (red)
    const lowPriority = await helper.createSimpleLayout({
      name: `E2E Low Priority ${Date.now()}`,
      widgetProps: {
        text: '<div style="background:#F44336;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-size:48px;">LOW PRIORITY</div>',
        duration: 60
      }
    });

    // High priority layout (green)
    const highPriority = await helper.createSimpleLayout({
      name: `E2E High Priority ${Date.now()}`,
      widgetProps: {
        text: '<div style="background:#4CAF50;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-size:48px;">HIGH PRIORITY</div>',
        duration: 60
      }
    });

    // Schedule both — low first, then high
    const lowCampaign = await helper.createCampaignWithLayouts(
      `E2E Low Campaign ${Date.now()}`,
      [lowPriority.layoutId]
    );
    await helper.scheduleOnTestDisplay(lowCampaign, { priority: 0 });

    const highCampaign = await helper.createCampaignWithLayouts(
      `E2E High Campaign ${Date.now()}`,
      [highPriority.layoutId]
    );
    await helper.scheduleOnTestDisplay(highCampaign, { priority: 10 });

    // Navigate and wait for any region (high priority should win)
    await gotoPlayerAndWaitForRegion(page, highPriority.regionId);

    // Verify a region with a widget is visible
    const region = page.locator('.renderer-lite-region');
    await expect(region.first()).toBeAttached();

    await page.screenshot({ path: 'test-results/priority.png', fullPage: true });
  });
});
