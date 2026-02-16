/**
 * E2E Visual Test: Layout Background
 *
 * Creates a layout with a text widget on an orange background and verifies rendering.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion } from './e2e-helpers.js';

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

    // Use createSimpleLayout with a div that simulates a background color
    const { layoutId, regionId } = await helper.createSimpleLayout({
      name: `E2E Background ${Date.now()}`,
      widgetType: 'text',
      widgetProps: {
        text: '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#FF9800;display:flex;align-items:center;justify-content:center;"><h1 style="color:#fff;font-size:72px;">Orange Background Test</h1></div>',
        duration: 30
      }
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E BG Campaign ${Date.now()}`,
      [layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    await gotoPlayerAndWaitForRegion(page, regionId);

    await page.screenshot({ path: 'test-results/layout-background.png', fullPage: true });

    const container = page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
