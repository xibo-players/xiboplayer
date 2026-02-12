/**
 * API Integration Tests: Campaign Management
 *
 * Tests campaign creation, layout assignment, and deletion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHelper } from '../../src/cms-test-helper.js';

describe('Campaign Management', () => {
  const helper = createTestHelper();

  beforeAll(async () => {
    await helper.setup();
  });

  afterAll(async () => {
    await helper.teardown();
  });

  it('should create a campaign', async () => {
    const api = helper.getApi();
    const campaign = await api.createCampaign(`Test Campaign ${Date.now()}`);
    helper.track('campaign', campaign.campaignId);

    expect(campaign).toHaveProperty('campaignId');
    expect(campaign.campaignId).toBeGreaterThan(0);
  });

  it('should list campaigns', async () => {
    const api = helper.getApi();
    const campaigns = await api.listCampaigns();

    expect(Array.isArray(campaigns)).toBe(true);
  });

  it('should assign a layout to a campaign', async () => {
    const { layoutId } = await helper.createSimpleLayout({
      name: `Campaign Layout ${Date.now()}`
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `Assignment Test ${Date.now()}`,
      [layoutId]
    );

    expect(campaignId).toBeGreaterThan(0);
  });

  it('should assign multiple layouts in order', async () => {
    const layout1 = await helper.createSimpleLayout({
      name: `Multi Layout 1 ${Date.now()}`
    });
    const layout2 = await helper.createSimpleLayout({
      name: `Multi Layout 2 ${Date.now()}`
    });

    const campaignId = await helper.createCampaignWithLayouts(
      `Multi Layout Campaign ${Date.now()}`,
      [layout1.layoutId, layout2.layoutId]
    );

    expect(campaignId).toBeGreaterThan(0);
  });

  it('should delete a campaign', async () => {
    const api = helper.getApi();
    const campaign = await api.createCampaign(`Delete Test ${Date.now()}`);

    // Should not throw
    await api.deleteCampaign(campaign.campaignId);
  });
});
