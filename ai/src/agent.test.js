/**
 * AI Campaign Creator Agent tests
 *
 * Tests tool definitions, CMS API client, and agent orchestration
 * with mocked Claude API and CMS responses.
 *
 * Based on upstream CMS API patterns (Xibo v4):
 * - Layout draft workflow: create parent → get draft → edit draft → publish parent
 * - Region response: regionPlaylist (singular), not playlists (array)
 * - Schedule: requires eventTypeId
 * - Full CRUD: create, read, update, delete for all entities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CmsApiClient, CmsApiError } from './cms-api-client.js';
import { getToolDefinitions, executeTool, CMS_TOOLS } from './tools.js';
import { AiAgent } from './agent.js';

// ── Mock fetch globally ──────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ── Helper: mock successful fetch ────────────────────────────────

function mockFetchResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type' && data !== null) return 'application/json';
        return null;
      },
    },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

/** Get the URL string from the Nth fetch call (shared client passes URL objects) */
function fetchUrl(callIndex = 0) {
  return String(mockFetch.mock.calls[callIndex][0]);
}

// ── CMS API Client tests ─────────────────────────────────────────

describe('CmsApiClient', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token-123',
    });
  });

  it('should make authenticated GET requests', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{ layoutId: 1, layout: 'Test' }]));

    const result = await cms.get('/layout');

    expect(fetchUrl()).toBe('https://cms.test.com/api/layout');
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.method).toBe('GET');
    expect(opts.headers.Authorization).toBe('Bearer test-token-123');
    expect(result).toEqual([{ layoutId: 1, layout: 'Test' }]);
  });

  it('should make POST requests with form-encoded body', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ layoutId: 5, layout: 'New Layout' }));

    const result = await cms.post('/layout', { name: 'New Layout', width: 1920 });

    expect(fetchUrl()).toBe('https://cms.test.com/api/layout');
    const opts = mockFetch.mock.calls[0][1];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(result.layoutId).toBe(5);
  });

  it('should throw CmsApiError on HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ message: 'Not Found' }, 404));

    await expect(cms.get('/layout/999')).rejects.toThrow(CmsApiError);
  });

  it('should request OAuth2 token when no pre-configured token', async () => {
    const oauthCms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      clientId: 'my-client',
      clientSecret: 'my-secret',
    });

    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      access_token: 'oauth-token-abc',
      expires_in: 3600,
    }));
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{ layoutId: 1 }]));

    await oauthCms.get('/layout');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const oauthCall = mockFetch.mock.calls[0];
    expect(oauthCall[0]).toBe('https://cms.test.com/api/authorize/access_token');
    expect(oauthCall[1].method).toBe('POST');

    const apiCall = mockFetch.mock.calls[1];
    expect(apiCall[1].headers.Authorization).toBe('Bearer oauth-token-abc');
  });

  it('should create layout with defaults', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      layoutId: 10,
      layout: 'My Layout',
      status: 1,
    }));

    const result = await cms.createLayout({ name: 'My Layout' });

    expect(result.layoutId).toBe(10);
  });

  it('should list displays', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { displayId: 1, display: 'Screen 1', loggedIn: 1 },
      { displayId: 2, display: 'Screen 2', loggedIn: 0 },
    ]));

    const result = await cms.listDisplays();

    expect(result).toHaveLength(2);
    expect(result[0].display).toBe('Screen 1');
  });

  // ── Xibo v4 Draft Layout ───────────────────────────────────────

  it('should get draft layout by parent ID', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 42, layout: 'Draft', status: 2, parentId: 10 },
    ]));

    const draft = await cms.getDraftLayout(10);

    expect(draft.layoutId).toBe(42);
    expect(fetchUrl()).toContain('parentId=10');
  });

  it('should return null when no draft exists', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    const draft = await cms.getDraftLayout(999);
    expect(draft).toBeNull();
  });

  // ── Delete operations ──────────────────────────────────────────

  it('should delete a layout', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    await cms.deleteLayout(10);

    expect(fetchUrl()).toBe('https://cms.test.com/api/layout/10');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('should delete a widget', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    await cms.deleteWidget(42);

    expect(fetchUrl()).toBe('https://cms.test.com/api/playlist/widget/42');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('should delete a campaign', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    await cms.deleteCampaign(7);

    expect(fetchUrl()).toBe('https://cms.test.com/api/campaign/7');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('should delete a schedule event', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    await cms.deleteSchedule(100);

    expect(fetchUrl()).toBe('https://cms.test.com/api/schedule/100');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  // ── Edit operations ────────────────────────────────────────────

  it('should edit a widget', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 42 }));

    await cms.editWidget(42, { duration: 30, text: 'Updated' });

    expect(fetchUrl()).toBe('https://cms.test.com/api/playlist/widget/42');
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  it('should edit a region', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ regionId: 20 }));

    await cms.editRegion(20, { width: 960, height: 540 });

    expect(fetchUrl()).toBe('https://cms.test.com/api/region/20');
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  // ── Resolution API ──────────────────────────────────────────────

  it('should list resolutions', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { resolutionId: 9, resolution: 'Full HD', width: 1920, height: 1080 },
      { resolutionId: 10, resolution: '4K UHD', width: 3840, height: 2160 },
    ]));

    const result = await cms.listResolutions();

    expect(result).toHaveLength(2);
    expect(result[0].resolutionId).toBe(9);
  });
});

// ── Tool definitions tests ───────────────────────────────────────

describe('Tool Definitions', () => {
  it('should export 39 tools', () => {
    expect(CMS_TOOLS.length).toBe(39);
  });

  it('should have valid Claude tool schema for all tools', () => {
    const defs = getToolDefinitions();

    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.input_schema).toBeTruthy();
      expect(def.input_schema.type).toBe('object');
    }
  });

  it('should have unique tool names', () => {
    const names = getToolDefinitions().map(d => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have all expected tool names', () => {
    const names = getToolDefinitions().map(d => d.name);

    // Read tools
    expect(names).toContain('list_layouts');
    expect(names).toContain('list_media');
    expect(names).toContain('list_displays');
    expect(names).toContain('list_display_groups');
    expect(names).toContain('list_templates');
    expect(names).toContain('list_resolutions');
    expect(names).toContain('get_draft_layout');

    // Create tools
    expect(names).toContain('create_layout');
    expect(names).toContain('add_region');
    expect(names).toContain('add_text_widget');
    expect(names).toContain('add_image_widget');
    expect(names).toContain('add_video_widget');
    expect(names).toContain('add_clock_widget');
    expect(names).toContain('add_embedded_widget');
    expect(names).toContain('add_webpage_widget');
    expect(names).toContain('add_hls_widget');
    expect(names).toContain('add_rss_widget');
    expect(names).toContain('add_dataset_widget');
    expect(names).toContain('add_weather_widget');
    expect(names).toContain('add_countdown_widget');
    expect(names).toContain('add_audio_widget');
    expect(names).toContain('add_pdf_widget');
    expect(names).toContain('add_localvideo_widget');
    expect(names).toContain('add_subplaylist_widget');
    expect(names).toContain('add_calendar_widget');
    expect(names).toContain('add_notification_widget');
    expect(names).toContain('add_currencies_widget');
    expect(names).toContain('add_stocks_widget');
    expect(names).toContain('add_menuboard_widget');
    expect(names).toContain('publish_layout');
    expect(names).toContain('create_campaign');
    expect(names).toContain('assign_layout_to_campaign');
    expect(names).toContain('schedule_campaign');

    // Update tools
    expect(names).toContain('edit_widget');
    expect(names).toContain('edit_region');

    // Delete tools
    expect(names).toContain('delete_layout');
    expect(names).toContain('delete_widget');
    expect(names).toContain('delete_campaign');
    expect(names).toContain('delete_schedule');
  });

  it('should organize tools by CRUD category', () => {
    const names = CMS_TOOLS.map(t => t.definition.name);
    // Read tools come first
    const listIdx = names.indexOf('list_layouts');
    // Create tools follow
    const createIdx = names.indexOf('create_layout');
    // Update tools
    const editIdx = names.indexOf('edit_widget');
    // Delete tools come last
    const deleteIdx = names.indexOf('delete_layout');

    expect(listIdx).toBeLessThan(createIdx);
    expect(createIdx).toBeLessThan(editIdx);
    expect(editIdx).toBeLessThan(deleteIdx);
  });
});

// ── Tool execution: Read operations ──────────────────────────────

describe('Tool Execution: Read', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should execute list_layouts with search filter', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 1, layout: 'Welcome', status: 1, width: 1920, height: 1080, tags: 'lobby' },
    ]));

    const result = await executeTool('list_layouts', cms, { search: 'Welcome', limit: 5 });

    expect(result).toHaveLength(1);
    expect(result[0].layoutId).toBe(1);
    expect(result[0].name).toBe('Welcome');
    // Verify search param sent to CMS
    const url = fetchUrl();
    expect(url).toContain('layout=Welcome');
    expect(url).toContain('length=5');
  });

  it('should execute list_media with type filter', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { mediaId: 5, name: 'logo.png', mediaType: 'image', fileName: 'logo.png', fileSize: 1024, tags: '' },
    ]));

    const result = await executeTool('list_media', cms, { type: 'image', limit: 3 });

    expect(result[0].mediaId).toBe(5);
    expect(result[0].type).toBe('image');
  });

  it('should execute list_displays', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { displayId: 1, display: 'Lobby', loggedIn: 1, lastAccessed: '2026-02-13', licensed: 1, displayGroupId: 10 },
    ]));

    const result = await executeTool('list_displays', cms, {});

    expect(result[0].displayId).toBe(1);
    expect(result[0].loggedIn).toBe(true);
    expect(result[0].licensed).toBe(true);
  });

  it('should execute list_display_groups', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { displayGroupId: 10, displayGroup: 'All Screens', description: '', isDynamic: 0 },
    ]));

    const result = await executeTool('list_display_groups', cms, {});

    expect(result[0].displayGroupId).toBe(10);
    expect(result[0].isDynamic).toBe(false);
  });

  it('should execute list_templates', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 100, layout: 'Retail Template', description: 'For shops', width: 1920, height: 1080, tags: 'retail' },
    ]));

    const result = await executeTool('list_templates', cms, {});

    expect(result[0].templateId).toBe(100);
    expect(result[0].name).toBe('Retail Template');
  });

  it('should execute list_resolutions', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { resolutionId: 9, resolution: 'Full HD', width: 1920, height: 1080 },
    ]));

    const result = await executeTool('list_resolutions', cms, {});

    expect(result[0].resolutionId).toBe(9);
    expect(result[0].width).toBe(1920);
  });

  it('should execute get_draft_layout', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{
      layoutId: 42, layout: 'Draft', status: 2,
      regions: [{
        regionId: 20, width: 1920, height: 1080,
        regionPlaylist: { playlistId: 30 },
      }],
    }]));

    const result = await executeTool('get_draft_layout', cms, { layoutId: 10 });

    expect(result.draftLayoutId).toBe(42);
    expect(result.parentLayoutId).toBe(10);
    expect(result.regions[0].playlistId).toBe(30);
  });
});

// ── Tool execution: Create operations ────────────────────────────

describe('Tool Execution: Create', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should execute create_layout with Xibo v4 draft pattern', async () => {
    // 1. createLayout returns parent
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      layoutId: 10, layout: 'Lunch Special', status: 1,
    }));
    // 2. getDraftLayout returns the editable draft
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 42, layout: 'Lunch Special', status: 2, parentId: 10 },
    ]));

    const result = await executeTool('create_layout', cms, { name: 'Lunch Special' });

    expect(result.layoutId).toBe(10); // Parent ID (for publishing)
    expect(result.draftLayoutId).toBe(42); // Draft ID (for editing)
    expect(result.note).toContain('draftLayoutId');
  });

  it('should execute create_layout with resolutionId', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ layoutId: 10 }));
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{ layoutId: 42 }]));

    await executeTool('create_layout', cms, { name: 'Test', resolutionId: 9 });

    // Verify resolutionId was sent
    const postCall = mockFetch.mock.calls[0];
    const body = postCall[1].body.toString();
    expect(body).toContain('resolutionId=9');
  });

  it('should execute add_region with Xibo v4 response format', async () => {
    // Xibo v4 returns regionPlaylist (singular), not playlists (array)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      regionId: 20,
      width: 1920,
      height: 1080,
      regionPlaylist: { playlistId: 30 },
    }));

    const result = await executeTool('add_region', cms, {
      layoutId: 42, width: 1920, height: 1080,
    });

    expect(result.regionId).toBe(20);
    expect(result.playlistId).toBe(30); // Parsed from regionPlaylist
  });

  it('should also handle legacy playlists array format', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      regionId: 20, width: 1920, height: 1080,
      playlists: [{ playlistId: 30 }],
    }));

    const result = await executeTool('add_region', cms, {
      layoutId: 42, width: 1920, height: 1080,
    });

    expect(result.playlistId).toBe(30);
  });

  it('should execute add_text_widget', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 42 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 42 }));

    const result = await executeTool('add_text_widget', cms, {
      playlistId: 30, text: '<h1>Hello World</h1>', duration: 15,
    });

    expect(result.widgetId).toBe(42);
    expect(result.type).toBe('text');
    expect(result.duration).toBe(15);
    // Verify POST call creates widget on correct playlist
    const url = fetchUrl(0);
    expect(url).toContain('/api/playlist/widget/text/30');
  });

  it('should execute add_image_widget with mediaId', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 43 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 43 }));

    const result = await executeTool('add_image_widget', cms, {
      playlistId: 30, mediaId: 5, duration: 10,
    });

    expect(result.widgetId).toBe(43);
    expect(result.mediaId).toBe(5);
    const url = fetchUrl(0);
    expect(url).toContain('/api/playlist/widget/image/30');
  });

  it('should execute add_video_widget with mute and loop', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 44 }));
    // Step 2: PUT sets widget properties (mute, loop, etc.)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 44 }));

    const result = await executeTool('add_video_widget', cms, {
      playlistId: 30, mediaId: 8, mute: true, loop: true,
    });

    expect(result.type).toBe('video');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('mute=1');
    expect(body).toContain('loop=1');
  });

  it('should execute add_clock_widget with format', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 45 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 45 }));

    const result = await executeTool('add_clock_widget', cms, {
      playlistId: 30, clockType: 2, format: 'HH:mm:ss',
    });

    expect(result.type).toBe('clock');
    const url = fetchUrl(0);
    expect(url).toContain('/api/playlist/widget/clock/30');
  });

  it('should execute add_embedded_widget with HTML/CSS/JS', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 46 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 46 }));

    const result = await executeTool('add_embedded_widget', cms, {
      playlistId: 30, html: '<div>Custom</div>', css: '.x{color:red}', javascript: 'alert(1)',
    });

    expect(result.type).toBe('embedded');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('embedHtml=');
    expect(body).toContain('embedStyle=');
    expect(body).toContain('embedScript=');
  });

  it('should execute add_webpage_widget', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 47 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 47 }));

    const result = await executeTool('add_webpage_widget', cms, {
      playlistId: 30, url: 'https://example.com',
    });

    expect(result.type).toBe('webpage');
    expect(result.url).toBe('https://example.com');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('uri=https');
  });

  it('should execute add_hls_widget with mute default', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 48 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 48 }));

    const result = await executeTool('add_hls_widget', cms, {
      playlistId: 30, url: 'https://stream.example.com/live.m3u8',
    });

    expect(result.type).toBe('hls');
    // Default: muted for signage — properties sent in PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('mute=1');
  });

  it('should execute add_rss_widget with feed URL', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 49 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 49 }));

    const result = await executeTool('add_rss_widget', cms, {
      playlistId: 30, feedUrl: 'https://news.example.com/rss',
    });

    expect(result.type).toBe('rss-ticker');
    expect(result.feedUrl).toBe('https://news.example.com/rss');
  });

  it('should execute add_weather_widget with display location', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 50 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 50 }));

    const result = await executeTool('add_weather_widget', cms, {
      playlistId: 30, useDisplayLocation: true,
    });

    expect(result.type).toBe('weather');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('useDisplayLocation=1');
    const url = fetchUrl(0);
    expect(url).toContain('/api/playlist/widget/forecastio/30');
  });

  it('should execute add_countdown_widget with style mapping', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 51 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 51 }));

    const result = await executeTool('add_countdown_widget', cms, {
      playlistId: 30, targetDate: '31/12/2026 23:59:59', style: 'days',
    });

    expect(result.type).toBe('countdown-days');
    const url = fetchUrl(0);
    expect(url).toContain('/api/playlist/widget/countdown-days/30');
  });

  it('should execute add_audio_widget via assignMediaToPlaylist', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));

    const result = await executeTool('add_audio_widget', cms, {
      playlistId: 30, mediaId: 12,
    });

    expect(result.type).toBe('audio');
    expect(result.assigned).toBe(true);
    const url = fetchUrl();
    expect(url).toContain('/api/playlist/library/assign/30');
  });

  it('should execute add_pdf_widget via assignMediaToPlaylist', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));

    const result = await executeTool('add_pdf_widget', cms, {
      playlistId: 30, mediaId: 15,
    });

    expect(result.type).toBe('pdf');
    expect(result.assigned).toBe(true);
  });

  it('should execute add_localvideo_widget with RTSP URL', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 52 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 52 }));

    const result = await executeTool('add_localvideo_widget', cms, {
      playlistId: 30, url: 'rtsp://camera.local/stream1',
    });

    expect(result.type).toBe('localvideo');
    expect(result.url).toBe('rtsp://camera.local/stream1');
  });

  it('should execute add_subplaylist_widget with arrangement', async () => {
    // Step 1: POST creates widget shell
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 53 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 53 }));

    const result = await executeTool('add_subplaylist_widget', cms, {
      playlistId: 30, subPlaylistIds: [100, 101], arrangement: 'roundrobin',
    });

    expect(result.type).toBe('subplaylist');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('arrangement=roundrobin');
    expect(body).toContain('subPlaylists=');
  });

  it('should execute add_calendar_widget with ICS feed', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 54 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 54 }));

    const result = await executeTool('add_calendar_widget', cms, {
      playlistId: 30, feedUrl: 'https://calendar.google.com/ics/xxx',
    });

    expect(result.type).toBe('ics-calendar');
  });

  it('should execute add_notification_widget', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 55 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 55 }));

    const result = await executeTool('add_notification_widget', cms, { playlistId: 30 });

    expect(result.type).toBe('notificationview');
  });

  it('should execute add_currencies_widget', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 56 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 56 }));

    const result = await executeTool('add_currencies_widget', cms, {
      playlistId: 30, base: 'EUR', items: 'USD,GBP,JPY',
    });

    expect(result.type).toBe('currencies');
  });

  it('should execute add_stocks_widget', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 57 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 57 }));

    const result = await executeTool('add_stocks_widget', cms, {
      playlistId: 30, items: 'AAPL,GOOGL',
    });

    expect(result.type).toBe('stocks');
  });

  it('should execute add_menuboard_widget with category', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 58 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 58 }));

    const result = await executeTool('add_menuboard_widget', cms, {
      playlistId: 30, menuId: 5, categoryId: 3,
    });

    expect(result.type).toBe('menuboard');
    // Properties are sent in the PUT call (call index 1)
    const body = mockFetch.mock.calls[1][1].body.toString();
    expect(body).toContain('categoryId=3');
  });

  it('should execute add_dataset_widget', async () => {
    // Step 1: POST creates widget shell (templateId goes in create)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 59 }));
    // Step 2: PUT sets widget properties
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 59 }));

    const result = await executeTool('add_dataset_widget', cms, {
      playlistId: 30, dataSetId: 7,
    });

    expect(result.type).toBe('dataset');
    expect(result.dataSetId).toBe(7);
  });

  it('should execute publish_layout', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));

    const result = await executeTool('publish_layout', cms, { layoutId: 10 });

    expect(result.status).toBe('published');
    const url = fetchUrl();
    expect(url).toContain('/api/layout/publish/10');
  });

  it('should execute create_campaign', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      campaignId: 7, campaign: 'Winter Sale',
    }));

    const result = await executeTool('create_campaign', cms, { name: 'Winter Sale' });

    expect(result.campaignId).toBe(7);
    expect(result.name).toBe('Winter Sale');
  });

  it('should execute assign_layout_to_campaign', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));

    const result = await executeTool('assign_layout_to_campaign', cms, {
      campaignId: 7, layoutId: 42, displayOrder: 2,
    });

    expect(result.campaignId).toBe(7);
    expect(result.layoutId).toBe(42);
    expect(result.displayOrder).toBe(2);
  });

  it('should execute schedule_campaign with eventTypeId', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ eventId: 100 }));

    const result = await executeTool('schedule_campaign', cms, {
      campaignId: 7,
      displayGroupIds: [1, 2],
      fromDt: '2026-02-14 08:00:00',
      toDt: '2026-02-21 18:00:00',
    });

    expect(result.eventId).toBe(100);
    expect(result.scheduled).toBe(true);
    // Verify eventTypeId was included
    const body = mockFetch.mock.calls[0][1].body.toString();
    expect(body).toContain('eventTypeId=1');
  });
});

// ── Tool execution: Update operations ────────────────────────────

describe('Tool Execution: Update', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should execute edit_widget with duration', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 42 }));

    const result = await executeTool('edit_widget', cms, {
      widgetId: 42, duration: 30,
    });

    expect(result.widgetId).toBe(42);
    expect(result.updated).toBe(true);
    const url = fetchUrl();
    expect(url).toContain('/api/playlist/widget/42');
    const body = mockFetch.mock.calls[0][1].body.toString();
    expect(body).toContain('duration=30');
    expect(body).toContain('useDuration=1');
  });

  it('should execute edit_region with position', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ regionId: 20 }));

    const result = await executeTool('edit_region', cms, {
      regionId: 20, width: 960, top: 100,
    });

    expect(result.regionId).toBe(20);
    expect(result.updated).toBe(true);
    const body = mockFetch.mock.calls[0][1].body.toString();
    expect(body).toContain('width=960');
    expect(body).toContain('top=100');
  });
});

// ── Tool execution: Delete operations ────────────────────────────

describe('Tool Execution: Delete', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should execute delete_layout', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    const result = await executeTool('delete_layout', cms, { layoutId: 10 });

    expect(result.deleted).toBe(true);
    expect(result.layoutId).toBe(10);
  });

  it('should execute delete_widget', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    const result = await executeTool('delete_widget', cms, { widgetId: 42 });

    expect(result.deleted).toBe(true);
    expect(result.widgetId).toBe(42);
  });

  it('should execute delete_campaign', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    const result = await executeTool('delete_campaign', cms, { campaignId: 7 });

    expect(result.deleted).toBe(true);
    expect(result.campaignId).toBe(7);
  });

  it('should execute delete_schedule', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(null, 204));

    const result = await executeTool('delete_schedule', cms, { eventId: 100 });

    expect(result.deleted).toBe(true);
    expect(result.eventId).toBe(100);
  });

  it('should throw on unknown tool', async () => {
    await expect(executeTool('nonexistent_tool', cms, {}))
      .rejects.toThrow('Unknown tool: nonexistent_tool');
  });
});

// ── End-to-end workflow tests (mocked) ───────────────────────────

describe('Workflow: Layout → Campaign → Schedule', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should complete a full create → publish → schedule workflow', async () => {
    // Step 1: create_layout → parent + draft
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ layoutId: 10, layout: 'Promo' }));
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{ layoutId: 42 }]));
    const layout = await executeTool('create_layout', cms, { name: 'Promo' });
    expect(layout.draftLayoutId).toBe(42);

    // Step 2: add_region to draft
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      regionId: 20, regionPlaylist: { playlistId: 30 }, width: 1920, height: 1080,
    }));
    const region = await executeTool('add_region', cms, {
      layoutId: layout.draftLayoutId, width: 1920, height: 1080,
    });
    expect(region.playlistId).toBe(30);

    // Step 3: add_text_widget to region playlist (two-step: POST create + PUT properties)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 50 }));
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 50 }));
    await executeTool('add_text_widget', cms, {
      playlistId: region.playlistId, text: '<h1>50% OFF</h1>', duration: 15,
    });

    // Step 4: publish_layout using parent ID
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));
    await executeTool('publish_layout', cms, { layoutId: layout.layoutId });

    // Step 5: create_campaign
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ campaignId: 7, campaign: 'Promo Campaign' }));
    const campaign = await executeTool('create_campaign', cms, { name: 'Promo Campaign' });

    // Step 6: assign_layout_to_campaign (use draftId — it's the live layout after publish)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ success: true }));
    await executeTool('assign_layout_to_campaign', cms, {
      campaignId: campaign.campaignId, layoutId: layout.draftLayoutId,
    });

    // Step 7: schedule_campaign
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ eventId: 200 }));
    const schedule = await executeTool('schedule_campaign', cms, {
      campaignId: campaign.campaignId,
      displayGroupIds: [1],
      fromDt: '2026-02-14 08:00:00',
      toDt: '2026-02-21 18:00:00',
    });

    expect(schedule.eventId).toBe(200);
    expect(schedule.scheduled).toBe(true);

    // Total API calls: create(1) + getDraft(1) + addRegion(1) + addWidget(2: POST+PUT) +
    // publish(1) + createCampaign(1) + assignLayout(1) + schedule(1) = 9
    expect(mockFetch).toHaveBeenCalledTimes(9);
  });
});

// ── Agent tests (mocked Claude API) ──────────────────────────────

describe('AiAgent', () => {
  let agent;
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
    agent = new AiAgent({
      apiKey: 'test-anthropic-key',
      cmsApi: cms,
    });
  });

  it('should send user message and get text response', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'I can help you create a campaign!' }],
      stop_reason: 'end_turn',
    }));

    const response = await agent.chat('I want to create a campaign');

    expect(response).toBe('I can help you create a campaign!');
    expect(agent.messages).toHaveLength(2);
  });

  it('should handle single tool use round', async () => {
    // Round 1: Claude requests tool use
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [
        { type: 'text', text: 'Let me search for existing layouts.' },
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'list_layouts',
          input: { search: 'welcome', limit: 5 },
        },
      ],
      stop_reason: 'tool_use',
    }));

    // CMS API response
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 1, layout: 'Welcome Screen', status: 1, width: 1920, height: 1080 },
    ]));

    // Round 2: Claude final text
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'I found 1 layout called "Welcome Screen".' }],
      stop_reason: 'end_turn',
    }));

    const response = await agent.chat('Show me welcome layouts');

    expect(response).toBe('I found 1 layout called "Welcome Screen".');
    expect(agent.messages).toHaveLength(4);
  });

  it('should handle tool errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{
        type: 'tool_use',
        id: 'tu_err',
        name: 'create_layout',
        input: { name: 'Test' },
      }],
      stop_reason: 'tool_use',
    }));

    // createLayout fails
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ message: 'Forbidden' }, 403));

    // Claude handles error
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'I encountered an error creating the layout. Please check your CMS permissions.' }],
      stop_reason: 'end_turn',
    }));

    const response = await agent.chat('Create a test layout');
    expect(response).toContain('error');
  });

  it('should include player context in system prompt', () => {
    agent.setPlayerContext({
      displayName: 'Lobby Screen',
      currentLayoutId: 42,
      cmsUrl: 'https://cms.test.com',
    });

    const prompt = agent._buildSystemPrompt();
    expect(prompt).toContain('Lobby Screen');
    expect(prompt).toContain('42');
  });

  it('should reset conversation', () => {
    agent.messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    ];

    agent.reset();

    expect(agent.messages).toHaveLength(0);
  });

  it('should call onToolCall and onToolResult callbacks', async () => {
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();

    agent = new AiAgent({
      apiKey: 'key',
      cmsApi: cms,
      onToolCall,
      onToolResult,
    });

    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{
        type: 'tool_use',
        id: 'tu_cb',
        name: 'list_displays',
        input: {},
      }],
      stop_reason: 'tool_use',
    }));

    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { displayId: 1, display: 'Screen 1', loggedIn: 1 },
    ]));

    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'Found 1 display.' }],
      stop_reason: 'end_turn',
    }));

    await agent.chat('List displays');

    expect(onToolCall).toHaveBeenCalledWith('list_displays', {});
    expect(onToolResult).toHaveBeenCalledWith('list_displays', expect.any(Array));
  });

  it('should send correct headers to Claude API', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
    }));

    await agent.chat('hello');

    const claudeCall = mockFetch.mock.calls[0];
    expect(claudeCall[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(claudeCall[1].headers['x-api-key']).toBe('test-anthropic-key');
    expect(claudeCall[1].headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(claudeCall[1].body);
    expect(body.tools).toHaveLength(39);
    expect(body.messages[0].content).toBe('hello');
  });

  it('should report conversation summary', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'list_layouts', input: {} },
        { type: 'tool_use', id: 'tu_2', name: 'list_media', input: {} },
      ],
      stop_reason: 'tool_use',
    }));

    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'Done' }],
      stop_reason: 'end_turn',
    }));

    await agent.chat('Search everything');

    const summary = agent.getConversationSummary();
    expect(summary.messageCount).toBe(4);
    expect(summary.toolCallsTotal).toBe(2);
  });
});
