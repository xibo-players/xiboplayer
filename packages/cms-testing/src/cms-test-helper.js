/**
 * CmsTestHelper — High-level test fixture manager for Xibo CMS integration tests
 *
 * Wraps CmsApiClient with automatic resource tracking and cleanup.
 * Every resource created via this helper is registered for cleanup in teardown().
 * Resources are deleted in reverse creation order (LIFO) to handle dependencies.
 *
 * Usage:
 *   const helper = new CmsTestHelper({ cmsUrl, clientId, clientSecret, ... });
 *   await helper.setup();
 *
 *   const { layoutId } = await helper.createSimpleLayout({ name: 'Test', widgetType: 'text' });
 *   const campaignId = await helper.createCampaignWithLayouts([layoutId]);
 *   await helper.scheduleOnTestDisplay(campaignId);
 *
 *   // ... run assertions ...
 *
 *   await helper.teardown(); // Deletes everything in reverse order
 */

import { CmsApiClient } from '@xiboplayer/utils';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from package root
dotenv.config({ path: join(__dirname, '..', '.env') });

export class CmsTestHelper {
  /**
   * @param {Object} config
   * @param {string} config.cmsUrl - CMS base URL
   * @param {string} config.clientId - OAuth2 client ID
   * @param {string} config.clientSecret - OAuth2 client secret
   * @param {string} [config.testDisplayHardwareKey] - Hardware key of test display
   * @param {string} [config.playerUrl] - URL of the player for E2E tests
   */
  constructor(config = {}) {
    this.config = {
      cmsUrl: config.cmsUrl || process.env.CMS_URL,
      clientId: config.clientId || process.env.CLIENT_ID,
      clientSecret: config.clientSecret || process.env.CLIENT_SECRET,
      testDisplayHardwareKey: config.testDisplayHardwareKey || process.env.TEST_DISPLAY_HARDWARE_KEY,
      playerUrl: config.playerUrl || process.env.PLAYER_URL
    };

    this.api = new CmsApiClient({
      baseUrl: this.config.cmsUrl,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret
    });

    // Resource tracking for cleanup (LIFO order)
    this.trackedResources = [];

    // Cached references
    this.testDisplay = null;
    this.testDisplayGroup = null;
    this.defaultResolutionId = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  /**
   * Initialize: authenticate, find test display, resolve default resolution
   */
  async setup() {
    await this.api.authenticate();

    // Find test display if hardware key is configured
    if (this.config.testDisplayHardwareKey) {
      this.testDisplay = await this.api.findDisplay(this.config.testDisplayHardwareKey);
      if (!this.testDisplay) {
        console.warn(`Test display not found for hardware key: ${this.config.testDisplayHardwareKey}`);
      }
    }

    // Find default 1080p resolution
    const resolutions = await this.api.listResolutions();
    const hd = resolutions.find(r => r.width === 1920 && r.height === 1080);
    this.defaultResolutionId = hd?.resolutionId || resolutions[0]?.resolutionId || 9;

    console.log(`[CmsTestHelper] Setup complete. Display: ${this.testDisplay?.display || 'N/A'}, Resolution: ${this.defaultResolutionId}`);
  }

  /**
   * Cleanup all tracked resources in reverse order
   */
  async teardown() {
    console.log(`[CmsTestHelper] Tearing down ${this.trackedResources.length} resources...`);

    // Delete in reverse order (LIFO) to handle dependencies
    const resources = [...this.trackedResources].reverse();

    for (const { type, id, label } of resources) {
      try {
        await this._deleteResource(type, id);
        console.log(`  Deleted ${type} ${id}${label ? ` (${label})` : ''}`);
      } catch (error) {
        // Don't fail teardown — resource may already be deleted
        console.warn(`  Failed to delete ${type} ${id}: ${error.message}`);
      }
    }

    this.trackedResources = [];
    this.testDisplayGroup = null;
    console.log('[CmsTestHelper] Teardown complete');
  }

  // ── Resource Tracking ─────────────────────────────────────────────

  /**
   * Register a resource for automatic cleanup
   * @param {string} type - Resource type (layout, campaign, schedule, media, displayGroup, region, widget)
   * @param {number} id - Resource ID
   * @param {string} [label] - Optional human-readable label for logging
   */
  track(type, id, label) {
    this.trackedResources.push({ type, id, label });
  }

  /**
   * Delete a single resource by type and ID
   */
  async _deleteResource(type, id) {
    switch (type) {
      case 'schedule': return this.api.deleteSchedule(id);
      case 'campaign': return this.api.deleteCampaign(id);
      case 'layout': return this.api.deleteLayout(id);
      case 'media': return this.api.deleteMedia(id);
      case 'displayGroup': return this.api.deleteDisplayGroup(id);
      case 'region': return this.api.deleteRegion(id);
      case 'widget': return this.api.deleteWidget(id);
      default:
        console.warn(`Unknown resource type: ${type}`);
    }
  }

  // ── Scenario Builders ─────────────────────────────────────────────

  /**
   * Create a simple layout with one region and one widget
   * @param {Object} params
   * @param {string} params.name - Layout name
   * @param {string} [params.widgetType='text'] - Widget type
   * @param {Object} [params.widgetProps] - Widget properties
   * @param {number} [params.resolutionId] - Resolution ID (defaults to 1080p)
   * @param {boolean} [params.publish=true] - Whether to publish after creation
   * @returns {Promise<{ layoutId, regionId, playlistId, widgetId }>}
   */
  async createSimpleLayout({ name, widgetType = 'text', widgetProps = {}, resolutionId, publish = true }) {
    // Create layout
    const layout = await this.api.createLayout({
      name,
      resolutionId: resolutionId || this.defaultResolutionId
    });
    this.track('layout', layout.layoutId, name);

    // Add region (full-screen)
    const region = await this.api.addRegion(layout.layoutId, {
      width: 1920,
      height: 1080,
      top: 0,
      left: 0
    });
    const regionId = region.regionId;
    const playlistId = region.playlists?.[0]?.playlistId;

    if (!playlistId) {
      throw new Error(`No playlist returned for region ${regionId}`);
    }

    // Add widget
    const defaultProps = widgetType === 'text'
      ? { text: '<h1>Test Widget</h1>', duration: 10, ...widgetProps }
      : { duration: 10, ...widgetProps };

    const widget = await this.api.addWidget(widgetType, playlistId, defaultProps);
    const widgetId = widget.widgetId;

    // Publish
    if (publish) {
      await this.api.publishLayout(layout.layoutId);
    }

    return { layoutId: layout.layoutId, regionId, playlistId, widgetId };
  }

  /**
   * Create a layout with multiple regions
   * @param {Object} params
   * @param {string} params.name - Layout name
   * @param {Array<{ width, height, top, left, widgetType, widgetProps }>} params.regions
   * @param {boolean} [params.publish=true]
   * @returns {Promise<{ layoutId, regions: Array<{ regionId, playlistId, widgetId }> }>}
   */
  async createMultiRegionLayout({ name, regions, publish = true }) {
    const layout = await this.api.createLayout({
      name,
      resolutionId: this.defaultResolutionId
    });
    this.track('layout', layout.layoutId, name);

    const createdRegions = [];

    for (const regionDef of regions) {
      const region = await this.api.addRegion(layout.layoutId, {
        width: regionDef.width || 960,
        height: regionDef.height || 540,
        top: regionDef.top || 0,
        left: regionDef.left || 0
      });

      const playlistId = region.playlists?.[0]?.playlistId;
      let widgetId = null;

      if (regionDef.widgetType && playlistId) {
        const widget = await this.api.addWidget(
          regionDef.widgetType,
          playlistId,
          { duration: 10, ...regionDef.widgetProps }
        );
        widgetId = widget.widgetId;
      }

      createdRegions.push({ regionId: region.regionId, playlistId, widgetId });
    }

    if (publish) {
      await this.api.publishLayout(layout.layoutId);
    }

    return { layoutId: layout.layoutId, regions: createdRegions };
  }

  /**
   * Create a campaign with assigned layouts
   * @param {string} name - Campaign name
   * @param {number[]} layoutIds - Layout IDs to assign (in order)
   * @returns {Promise<number>} Campaign ID
   */
  async createCampaignWithLayouts(name, layoutIds) {
    const campaign = await this.api.createCampaign(name);
    this.track('campaign', campaign.campaignId, name);

    for (let i = 0; i < layoutIds.length; i++) {
      await this.api.assignLayoutToCampaign(campaign.campaignId, layoutIds[i], i + 1);
    }

    return campaign.campaignId;
  }

  /**
   * Schedule a campaign on the test display
   * @param {number} campaignId
   * @param {Object} [options]
   * @param {number} [options.priority=0] - Schedule priority
   * @param {string} [options.fromDt] - Start date (ISO 8601)
   * @param {string} [options.toDt] - End date (ISO 8601)
   * @returns {Promise<number>} Event ID
   */
  async scheduleOnTestDisplay(campaignId, options = {}) {
    // Ensure we have a display group for the test display
    const displayGroupId = await this._getOrCreateTestDisplayGroup();

    // Default: schedule for 24 hours starting now
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const event = await this.api.createSchedule({
      eventTypeId: 1, // Campaign
      campaignId,
      displayGroupIds: [displayGroupId],
      fromDt: options.fromDt || now.toISOString(),
      toDt: options.toDt || tomorrow.toISOString(),
      isPriority: options.priority || 0
    });

    if (event?.eventId) {
      this.track('schedule', event.eventId);
    }

    return event?.eventId;
  }

  /**
   * Upload a test image file
   * @param {Buffer|Blob} fileData - File content
   * @param {string} fileName - File name (e.g. 'test.jpg')
   * @returns {Promise<number>} Media ID
   */
  async uploadTestImage(fileData, fileName) {
    const formData = new FormData();
    formData.append('files', new Blob([fileData]), fileName);
    formData.append('name', fileName);

    const result = await this.api.uploadMedia(formData);
    const mediaId = result?.mediaId || result?.files?.[0]?.mediaId;

    if (mediaId) {
      this.track('media', mediaId, fileName);
    }

    return mediaId;
  }

  /**
   * Upload a test video file
   * @param {Buffer|Blob} fileData - File content
   * @param {string} fileName - File name (e.g. 'test.mp4')
   * @returns {Promise<number>} Media ID
   */
  async uploadTestVideo(fileData, fileName) {
    return this.uploadTestImage(fileData, fileName); // Same upload API
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Get or create a display group for the test display
   * @returns {Promise<number>} Display group ID
   */
  async _getOrCreateTestDisplayGroup() {
    if (this.testDisplayGroup) {
      return this.testDisplayGroup;
    }

    if (!this.testDisplay) {
      throw new Error('No test display configured. Set TEST_DISPLAY_HARDWARE_KEY in .env');
    }

    // Each display has an auto-created display group with the same name
    // Try to find it first
    const groups = await this.api.listDisplayGroups({ displayGroup: this.testDisplay.display });
    const existingGroup = groups.find(g => g.displayGroup === this.testDisplay.display);

    if (existingGroup) {
      this.testDisplayGroup = existingGroup.displayGroupId;
      return this.testDisplayGroup;
    }

    // Create a test display group
    const groupName = `Test-${this.testDisplay.display}-${Date.now()}`;
    const group = await this.api.createDisplayGroup(groupName);
    this.track('displayGroup', group.displayGroupId, groupName);

    // Assign display to group
    await this.api.assignDisplayToGroup(group.displayGroupId, this.testDisplay.displayId);

    this.testDisplayGroup = group.displayGroupId;
    return this.testDisplayGroup;
  }

  /**
   * Wait for a specified number of seconds
   * @param {number} seconds
   */
  async wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Get the underlying CmsApiClient for direct API access
   * @returns {CmsApiClient}
   */
  getApi() {
    return this.api;
  }
}

/**
 * Create a CmsTestHelper from environment variables
 * @returns {CmsTestHelper}
 */
export function createTestHelper(overrides = {}) {
  return new CmsTestHelper(overrides);
}
