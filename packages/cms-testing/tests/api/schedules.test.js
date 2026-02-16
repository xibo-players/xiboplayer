/**
 * API Integration Tests: Schedule Management
 *
 * Tests schedule creation and deletion. Requires a test display to be configured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHelper, CmsTestHelper } from '../../src/cms-test-helper.js';

describe('Schedule Management', () => {
  const helper = createTestHelper();

  beforeAll(async () => {
    await helper.setup();
  });

  afterAll(async () => {
    await helper.teardown();
  });

  it('should list display groups (or create one)', async () => {
    const api = helper.getApi();
    // isDisplaySpecific=-1 includes auto-created per-display groups
    let groups = await api.listDisplayGroups({ isDisplaySpecific: -1 });

    expect(Array.isArray(groups)).toBe(true);

    // Fresh CMS may have no display groups yet — create one for testing
    if (groups.length === 0) {
      const group = await api.createDisplayGroup(`Test Group ${Date.now()}`);
      helper.track('displayGroup', group.displayGroupId);
      groups = await api.listDisplayGroups({ isDisplaySpecific: -1 });
    }

    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]).toHaveProperty('displayGroupId');
  });

  it('should schedule a campaign on the test display', async () => {
    if (!helper.testDisplay) {
      console.log('Skipping: no test display configured');
      return;
    }

    const { layoutId } = await helper.createSimpleLayout({
      name: `Schedule Layout ${Date.now()}`
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `Schedule Campaign ${Date.now()}`,
      [layoutId]
    );

    const eventId = await helper.scheduleOnTestDisplay(campaignId);

    expect(eventId).toBeDefined();
  });

  it('should create a priority schedule', async () => {
    if (!helper.testDisplay) {
      console.log('Skipping: no test display configured');
      return;
    }

    const { layoutId } = await helper.createSimpleLayout({
      name: `Priority Layout ${Date.now()}`
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `Priority Campaign ${Date.now()}`,
      [layoutId]
    );

    const eventId = await helper.scheduleOnTestDisplay(campaignId, {
      priority: 1
    });

    expect(eventId).toBeDefined();
  });

  it('should create a time-bounded schedule', async () => {
    if (!helper.testDisplay) {
      console.log('Skipping: no test display configured');
      return;
    }

    const { layoutId } = await helper.createSimpleLayout({
      name: `Time-Bound Layout ${Date.now()}`
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `Time-Bound Campaign ${Date.now()}`,
      [layoutId]
    );

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const eventId = await helper.scheduleOnTestDisplay(campaignId, {
      fromDt: CmsTestHelper._formatDate(now),
      toDt: CmsTestHelper._formatDate(oneHourLater)
    });

    expect(eventId).toBeDefined();
  });
});
