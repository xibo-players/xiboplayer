/**
 * E2E Visual Test: Widget Types
 *
 * Tests rendering of different widget types:
 * text, embedded HTML, clock (if available).
 */
import { test, expect } from '@playwright/test';
import { createTestHelper } from '../../src/cms-test-helper.js';

test.describe('Widget Types Rendering', () => {
  let helper;

  test.beforeAll(async () => {
    helper = createTestHelper();
    await helper.setup();
  });

  test.afterAll(async () => {
    await helper.teardown();
  });

  test('should render a text widget with rich HTML', async ({ page }) => {
    if (!helper.testDisplay) {
      test.skip();
      return;
    }

    const { layoutId } = await helper.createSimpleLayout({
      name: `E2E Text Widget ${Date.now()}`,
      widgetType: 'text',
      widgetProps: {
        text: `
          <div style="padding: 40px; font-family: Arial, sans-serif;">
            <h1 style="color: #2196F3; font-size: 48px;">Rich Text Test</h1>
            <p style="font-size: 24px; color: #666;">
              Testing <strong>bold</strong>, <em>italic</em>, and
              <span style="color: #E91E63;">colored</span> text rendering.
            </p>
            <ul style="font-size: 20px; color: #333;">
              <li>List item 1</li>
              <li>List item 2</li>
              <li>List item 3</li>
            </ul>
          </div>
        `,
        duration: 30
      }
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Text Campaign ${Date.now()}`,
      [layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');
    await page.waitForTimeout(10000);

    await page.screenshot({ path: 'test-results/widget-text.png', fullPage: true });

    const container = await page.locator('#player-container');
    await expect(container).toBeVisible();
  });

  test('should render an embedded HTML widget', async ({ page }) => {
    if (!helper.testDisplay) {
      test.skip();
      return;
    }

    const { layoutId } = await helper.createSimpleLayout({
      name: `E2E Embedded ${Date.now()}`,
      widgetType: 'embedded',
      widgetProps: {
        embedHtml: `
          <div style="width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;">
            Embedded Widget
          </div>
        `,
        duration: 30
      }
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `E2E Embedded Campaign ${Date.now()}`,
      [layoutId]
    );

    await helper.scheduleOnTestDisplay(campaignId, { priority: 10 });

    await page.goto(process.env.PLAYER_URL || 'https://h1.superpantalles.com/player/pwa/');
    await page.waitForTimeout(10000);

    await page.screenshot({ path: 'test-results/widget-embedded.png', fullPage: true });
  });
});
