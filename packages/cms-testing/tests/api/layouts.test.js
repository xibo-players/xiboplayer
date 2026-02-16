/**
 * API Integration Tests: Layout CRUD
 *
 * Tests layout creation, region management, widget management,
 * publishing, and deletion against a real CMS instance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHelper } from '../../src/cms-test-helper.js';

describe('Layout CRUD', () => {
  const helper = createTestHelper();

  beforeAll(async () => {
    await helper.setup();
  });

  afterAll(async () => {
    await helper.teardown();
  });

  it('should create a layout', async () => {
    const api = helper.getApi();
    const layout = await api.createLayout({
      name: `Test Layout ${Date.now()}`,
      resolutionId: helper.defaultResolutionId
    });
    helper.track('layout', layout.layoutId);

    expect(layout).toHaveProperty('layoutId');
    expect(layout.layoutId).toBeGreaterThan(0);
  });

  it('should list layouts and find the created one', async () => {
    const uniqueName = `List Test ${Date.now()}`;
    const api = helper.getApi();

    const layout = await api.createLayout({
      name: uniqueName,
      resolutionId: helper.defaultResolutionId
    });
    helper.track('layout', layout.layoutId);

    const layouts = await api.listLayouts({ layout: uniqueName });

    expect(layouts.length).toBeGreaterThanOrEqual(1);
    expect(layouts.some(l => l.layoutId === layout.layoutId)).toBe(true);
  });

  it('should add a region to a layout', async () => {
    const api = helper.getApi();

    const layout = await api.createLayout({
      name: `Region Test ${Date.now()}`,
      resolutionId: helper.defaultResolutionId
    });
    helper.track('layout', layout.layoutId);

    // Xibo v4: find auto-created draft (editable copy)
    const draft = await api.getDraftLayout(layout.layoutId);
    const draftId = draft?.layoutId || layout.layoutId;

    const region = await api.addRegion(draftId, {
      width: 1920, height: 1080, top: 0, left: 0
    });

    expect(region).toHaveProperty('regionId');
    // Xibo v4 returns regionPlaylist (singular object)
    expect(region.regionPlaylist).toBeDefined();
    expect(region.regionPlaylist).toHaveProperty('playlistId');
  });

  it('should add a text widget to a region', async () => {
    const api = helper.getApi();

    const layout = await api.createLayout({
      name: `Widget Test ${Date.now()}`,
      resolutionId: helper.defaultResolutionId
    });
    helper.track('layout', layout.layoutId);

    // Xibo v4: find auto-created draft (editable copy)
    const draft = await api.getDraftLayout(layout.layoutId);
    const draftId = draft?.layoutId || layout.layoutId;

    const region = await api.addRegion(draftId, {
      width: 1920, height: 1080, top: 0, left: 0
    });

    // Xibo v4 returns regionPlaylist (singular object)
    const playlistId = region.regionPlaylist.playlistId;
    const widget = await api.addWidget('text', playlistId, {
      text: '<h1>Hello World</h1>',
      duration: 10
    });

    expect(widget).toHaveProperty('widgetId');
  });

  it('should publish a layout', async () => {
    const { layoutId } = await helper.createSimpleLayout({
      name: `Publish Test ${Date.now()}`,
      publish: false
    });

    // Publish expects the parent ID (layoutId when publish=false is still the parent)
    await helper.getApi().publishLayout(layoutId);
  });

  it('should delete a layout', async () => {
    const api = helper.getApi();

    const layout = await api.createLayout({
      name: `Delete Test ${Date.now()}`,
      resolutionId: helper.defaultResolutionId
    });

    // Delete should not throw
    await api.deleteLayout(layout.layoutId);

    // Verify it's gone
    const layouts = await api.listLayouts({ layoutId: layout.layoutId });
    expect(layouts.length).toBe(0);
  });

  it('should create a complete layout using helper', async () => {
    const result = await helper.createSimpleLayout({
      name: `Helper Test ${Date.now()}`,
      widgetType: 'text',
      widgetProps: { text: '<p>Auto-created</p>', duration: 15 }
    });

    expect(result.layoutId).toBeGreaterThan(0);
    expect(result.regionId).toBeDefined();
    expect(result.playlistId).toBeDefined();
    expect(result.widgetId).toBeDefined();
  });
});
