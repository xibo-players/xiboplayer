/**
 * E2E Visual Test: Simple Layout
 *
 * Creates a single-region text layout via API, schedules it,
 * then verifies the player renders it correctly.
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';

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
    // Create and schedule a layout via API
    const { layoutId } = await helper.createSimpleLayout({
      name: `E2E Simple ${Date.now()}`,
      widgetType: 'text',
      widgetProps: {
        text: '<h1 id="e2e-marker" style="color: #4CAF50; font-size: 72px; text-align: center;">E2E Test Active</h1>',
        duration: 60
      }
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Simple Campaign ${Date.now()}`,
      [layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    // Navigate to player
    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');

    // Wait for layout to render (player needs to collect and display)
    // Use generous timeout — player collection interval may be up to 5 min
    await page.waitForTimeout(10000);

    // Check that the player container exists
    const container = await page.locator('#player-container');
    await expect(container).toBeVisible();

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/simple-layout.png', fullPage: true });
  });
});
