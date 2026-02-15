/**
 * E2E Visual Test: Simple Layout
 *
 * Creates a single-region text layout via API, schedules it,
 * then verifies the player renders it correctly.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion } from './e2e-helpers.js';

test.describe('Simple Layout Rendering', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should render a text layout', async ({ page }) => {
    const { layoutId, regionId } = await helper.createSimpleLayout({
      name: `E2E Simple ${Date.now()}`,
      widgetType: 'text',
      widgetProps: {
        text: '<h1 style="color: #4CAF50; font-size: 72px; text-align: center;">E2E Test Active</h1>',
        duration: 60
      }
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Simple Campaign ${Date.now()}`,
      [layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    // Navigate and wait for our region to appear in the DOM
    await gotoPlayerAndWaitForRegion(page, regionId);

    // Verify a widget is rendered inside the region
    const widget = page.locator('.renderer-lite-region .renderer-lite-widget');
    await expect(widget.first()).toBeAttached();

    await page.screenshot({ path: 'test-results/simple-layout.png', fullPage: true });
  });
});
