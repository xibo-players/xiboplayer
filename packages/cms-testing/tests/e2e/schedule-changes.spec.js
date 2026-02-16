/**
 * E2E Visual Test: Schedule Changes
 *
 * Tests that the player picks up schedule changes:
 * 1. Schedule layout A → player renders it
 * 2. Add layout B with higher priority
 * 3. Wait for player to collect → should switch to B
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion, waitForRegionChange } from './e2e-helpers.js';

test.describe('Schedule Changes', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should pick up new schedule content', async ({ page }) => {
    test.setTimeout(240000); // 4 min — needs two collection cycles

    if (!helper.testDisplay) {
      test.skip();
      return;
    }

    // Schedule A (blue)
    const layoutA = await helper.createSimpleLayout({
      name: `E2E Schedule A ${Date.now()}`,
      widgetProps: {
        text: '<div style="background:#1565C0;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-size:72px;">SCHEDULE A</div>',
        duration: 60
      }
    });

    const campaignA = await helper.createCampaignWithLayouts(
      `E2E Schedule A Campaign ${Date.now()}`,
      [layoutA.layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignA, { priority: 5 });

    // Navigate and wait for layout A to render
    await gotoPlayerAndWaitForRegion(page, layoutA.regionId);
    await page.screenshot({ path: 'test-results/schedule-change-before.png', fullPage: true });

    // Now add Schedule B with higher priority (orange)
    const layoutB = await helper.createSimpleLayout({
      name: `E2E Schedule B ${Date.now()}`,
      widgetProps: {
        text: '<div style="background:#FF6F00;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;font-size:72px;">SCHEDULE B</div>',
        duration: 60
      }
    });

    const campaignB = await helper.createCampaignWithLayouts(
      `E2E Schedule B Campaign ${Date.now()}`,
      [layoutB.layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignB, { priority: 20 });

    // Wait for player to pick up new schedule (next collection cycle)
    await waitForRegionChange(page, layoutB.regionId, 180000);
    await page.screenshot({ path: 'test-results/schedule-change-after.png', fullPage: true });

    const container = page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
