/**
 * E2E Visual Test: Schedule Changes
 *
 * Tests that the player picks up schedule changes:
 * 1. Schedule layout A
 * 2. Take screenshot (should show A)
 * 3. Replace with layout B (higher priority)
 * 4. Wait for collection
 * 5. Take screenshot (should show B)
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';

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
    test.setTimeout(180000); // 3 min

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

    // Navigate and take first screenshot
    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');
    await page.waitForTimeout(15000);
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
    await page.waitForTimeout(30000);
    await page.screenshot({ path: 'test-results/schedule-change-after.png', fullPage: true });

    const container = await page.locator('#player-container');
    await expect(container).toBeVisible();
  });
});
