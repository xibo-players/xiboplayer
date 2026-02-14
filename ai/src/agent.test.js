/**
 * AI Campaign Creator Agent tests
 *
 * Tests tool definitions, CMS API client, and agent orchestration
 * with mocked Claude API and CMS responses.
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
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
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

    const result = await cms.get('/api/layout');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cms.test.com/api/layout',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
    expect(result).toEqual([{ layoutId: 1, layout: 'Test' }]);
  });

  it('should make POST requests with form-encoded body', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ layoutId: 5, layout: 'New Layout' }));

    const result = await cms.post('/api/layout', { name: 'New Layout', width: 1920 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cms.test.com/api/layout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );
    expect(result.layoutId).toBe(5);
  });

  it('should throw CmsApiError on HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ message: 'Not Found' }, 404));

    await expect(cms.get('/api/layout/999')).rejects.toThrow(CmsApiError);
  });

  it('should request OAuth2 token when no pre-configured token', async () => {
    const oauthCms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      clientId: 'my-client',
      clientSecret: 'my-secret',
    });

    // First call: OAuth token request
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      access_token: 'oauth-token-abc',
      expires_in: 3600,
    }));

    // Second call: actual API request
    mockFetch.mockResolvedValueOnce(mockFetchResponse([{ layoutId: 1 }]));

    await oauthCms.get('/api/layout');

    // Verify OAuth call
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const oauthCall = mockFetch.mock.calls[0];
    expect(oauthCall[0]).toBe('https://cms.test.com/api/authorize/access_token');
    expect(oauthCall[1].method).toBe('POST');

    // Verify API call uses OAuth token
    const apiCall = mockFetch.mock.calls[1];
    expect(apiCall[1].headers.Authorization).toBe('Bearer oauth-token-abc');
  });

  it('should create layout with defaults', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      layoutId: 10,
      layout: 'My Layout',
      status: 1,
      regions: [{ regionId: 20, width: 1920, height: 1080, playlists: [{ playlistId: 30 }] }],
    }));

    const result = await cms.createLayout('My Layout');

    expect(result.layoutId).toBe(10);
    expect(result.regions[0].regionId).toBe(20);
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
});

// ── Tool definitions tests ───────────────────────────────────────

describe('Tool Definitions', () => {
  it('should export 16 tools', () => {
    expect(CMS_TOOLS.length).toBe(16);
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
    expect(names).toContain('list_layouts');
    expect(names).toContain('create_layout');
    expect(names).toContain('add_region');
    expect(names).toContain('add_text_widget');
    expect(names).toContain('add_image_widget');
    expect(names).toContain('add_video_widget');
    expect(names).toContain('add_clock_widget');
    expect(names).toContain('add_embedded_widget');
    expect(names).toContain('publish_layout');
    expect(names).toContain('list_media');
    expect(names).toContain('create_campaign');
    expect(names).toContain('assign_layout_to_campaign');
    expect(names).toContain('schedule_campaign');
    expect(names).toContain('list_displays');
    expect(names).toContain('list_display_groups');
    expect(names).toContain('list_templates');
  });
});

// ── Tool execution tests ─────────────────────────────────────────

describe('Tool Execution', () => {
  let cms;

  beforeEach(() => {
    mockFetch.mockReset();
    cms = new CmsApiClient({
      cmsUrl: 'https://cms.test.com',
      apiToken: 'test-token',
    });
  });

  it('should execute list_layouts tool', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 1, layout: 'Welcome', status: 1, width: 1920, height: 1080, tags: 'lobby' },
      { layoutId: 2, layout: 'Menu', status: 1, width: 1920, height: 1080, tags: 'food' },
    ]));

    const result = await executeTool('list_layouts', cms, { search: 'Welcome', limit: 5 });

    expect(result).toHaveLength(2);
    expect(result[0].layoutId).toBe(1);
    expect(result[0].name).toBe('Welcome');
  });

  it('should execute create_layout tool', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      layoutId: 5,
      layout: 'Lunch Special',
      status: 1,
      regions: [{ regionId: 10, width: 1920, height: 1080, playlists: [{ playlistId: 15 }] }],
    }));

    const result = await executeTool('create_layout', cms, {
      name: 'Lunch Special',
      backgroundColor: '#FF0000',
    });

    expect(result.layoutId).toBe(5);
    expect(result.regions[0].playlistId).toBe(15);
  });

  it('should execute add_text_widget tool', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ widgetId: 42 }));

    const result = await executeTool('add_text_widget', cms, {
      playlistId: 15,
      text: '<h1>Hello World</h1>',
      duration: 15,
    });

    expect(result.widgetId).toBe(42);
    expect(result.type).toBe('text');
    expect(result.duration).toBe(15);
  });

  it('should execute create_campaign tool', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ campaignId: 7, campaign: 'Winter Sale' }));

    const result = await executeTool('create_campaign', cms, { name: 'Winter Sale' });

    expect(result.campaignId).toBe(7);
    expect(result.name).toBe('Winter Sale');
  });

  it('should execute schedule_campaign tool', async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ eventId: 100 }));

    const result = await executeTool('schedule_campaign', cms, {
      campaignId: 7,
      displayGroupIds: [1, 2],
      fromDt: '2026-02-14 08:00:00',
      toDt: '2026-02-21 18:00:00',
      priority: 5,
    });

    expect(result.eventId).toBe(100);
    expect(result.scheduled).toBe(true);
  });

  it('should throw on unknown tool', async () => {
    await expect(executeTool('nonexistent_tool', cms, {}))
      .rejects.toThrow('Unknown tool: nonexistent_tool');
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
    // Mock Claude API response (no tool use)
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'I can help you create a campaign!' }],
      stop_reason: 'end_turn',
    }));

    const response = await agent.chat('I want to create a campaign');

    expect(response).toBe('I can help you create a campaign!');
    expect(agent.messages).toHaveLength(2); // user + assistant
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

    // CMS API response for list_layouts
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { layoutId: 1, layout: 'Welcome Screen', status: 1, width: 1920, height: 1080 },
    ]));

    // Round 2: Claude responds with final text
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{ type: 'text', text: 'I found 1 layout called "Welcome Screen".' }],
      stop_reason: 'end_turn',
    }));

    const response = await agent.chat('Show me welcome layouts');

    expect(response).toBe('I found 1 layout called "Welcome Screen".');
    // Messages: user, assistant(tool_use), user(tool_result), assistant(text)
    expect(agent.messages).toHaveLength(4);
  });

  it('should handle tool errors gracefully', async () => {
    // Claude requests a tool
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{
        type: 'tool_use',
        id: 'tu_err',
        name: 'create_layout',
        input: { name: 'Test' },
      }],
      stop_reason: 'tool_use',
    }));

    // CMS returns error
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ message: 'Forbidden' }, 403));

    // Claude handles the error
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

    // Claude requests tool
    mockFetch.mockResolvedValueOnce(mockFetchResponse({
      content: [{
        type: 'tool_use',
        id: 'tu_cb',
        name: 'list_displays',
        input: {},
      }],
      stop_reason: 'tool_use',
    }));

    // CMS response
    mockFetch.mockResolvedValueOnce(mockFetchResponse([
      { displayId: 1, display: 'Screen 1', loggedIn: 1 },
    ]));

    // Claude final response
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
    expect(claudeCall[1].headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const body = JSON.parse(claudeCall[1].body);
    expect(body.tools).toHaveLength(16);
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

    // Two CMS calls
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
