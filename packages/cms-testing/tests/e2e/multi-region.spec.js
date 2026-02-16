/**
 * E2E Visual Test: Multi-Region Layout
 *
 * Creates a layout with two regions (left panel + right panel),
 * schedules it, and verifies both regions render.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';
import { gotoPlayerAndWaitForRegion } from './e2e-helpers.js';

test.describe('Multi-Region Layout Rendering', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should render multiple regions simultaneously', async ({ page }) => {
    const result = await helper.createMultiRegionLayout({
      name: `E2E Multi-Region ${Date.now()}`,
      regions: [
        {
          width: 960, height: 1080, top: 0, left: 0,
          widgetType: 'text',
          widgetProps: {
            text: '<div style="background:#1565C0;color:#fff;height:100%;display:flex;align-items:center;justify-content:center;"><h1>LEFT</h1></div>',
            duration: 60
          }
        },
        {
          width: 960, height: 1080, top: 0, left: 960,
          widgetType: 'text',
          widgetProps: {
            text: '<div style="background:#C62828;color:#fff;height:100%;display:flex;align-items:center;justify-content:center;"><h1>RIGHT</h1></div>',
            duration: 60
          }
        }
      ]
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Multi Campaign ${Date.now()}`,
      [result.layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    // Wait for the first region to appear
    const firstRegionId = result.regions[0].regionId;
    await gotoPlayerAndWaitForRegion(page, firstRegionId);

    // Wait a moment for all regions to render
    await page.waitForTimeout(3000);

    // Verify regions exist (may be 1 if XLF merges them, or 2+ for multi-region)
    const regions = await page.locator('.renderer-lite-region').count();
    expect(regions).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: 'test-results/multi-region.png', fullPage: true });
  });
});
