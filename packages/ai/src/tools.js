/**
 * CMS Tool Definitions for AI Agent
 *
 * Each tool has:
 *   - definition: Claude-compatible tool schema (name, description, input_schema)
 *   - handler(cmsApi, input): async function that calls CMS API and returns result
 *
 * @module @xiboplayer/ai/tools
 */

// ── Tool: list_layouts ────────────────────────────────────────────

const listLayouts = {
  definition: {
    name: 'list_layouts',
    description: 'Search existing layouts in the CMS. Returns layout ID, name, status, dimensions, and tags. Use this to find layouts before modifying them or to check what already exists.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term to filter layouts by name' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
    },
  },
  async handler(cms, input) {
    const params = { length: input.limit || 10 };
    if (input.search) params.layout = input.search;
    const layouts = await cms.listLayouts(params);
    return layouts.map(l => ({
      layoutId: l.layoutId,
      name: l.layout,
      status: l.status,
      width: l.width,
      height: l.height,
      tags: l.tags,
      description: l.description,
    }));
  },
};

// ── Tool: create_layout ───────────────────────────────────────────

const createLayout = {
  definition: {
    name: 'create_layout',
    description: 'Create a new blank layout with specified dimensions and background color. Returns the new layout ID and its default region. The layout starts in draft status — you must publish it after adding content.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Layout name (e.g. "Lunch Special - Monday")' },
        description: { type: 'string', description: 'Optional layout description' },
        width: { type: 'number', description: 'Canvas width in pixels (default 1920)', default: 1920 },
        height: { type: 'number', description: 'Canvas height in pixels (default 1080)', default: 1080 },
        backgroundColor: { type: 'string', description: 'Hex background color (default "#000000")', default: '#000000' },
      },
      required: ['name'],
    },
  },
  async handler(cms, input) {
    const result = await cms.createLayout(input.name, {
      width: input.width || 1920,
      height: input.height || 1080,
      backgroundColor: input.backgroundColor || '#000000',
      description: input.description || '',
    });
    return {
      layoutId: result.layoutId,
      name: result.layout,
      status: result.status,
      regions: (result.regions || []).map(r => ({
        regionId: r.regionId,
        width: r.width,
        height: r.height,
        playlistId: r.playlists?.[0]?.playlistId,
      })),
    };
  },
};

// ── Tool: add_region ──────────────────────────────────────────────

const addRegion = {
  definition: {
    name: 'add_region',
    description: 'Add a content region to a layout. Regions are rectangular areas where widgets (text, images, videos) are placed. Position with top/left coordinates and size with width/height.',
    input_schema: {
      type: 'object',
      properties: {
        layoutId: { type: 'number', description: 'Layout ID to add the region to' },
        name: { type: 'string', description: 'Region name (e.g. "Header", "Main Content", "Footer")' },
        width: { type: 'number', description: 'Region width in pixels' },
        height: { type: 'number', description: 'Region height in pixels' },
        top: { type: 'number', description: 'Top position in pixels (from canvas top)', default: 0 },
        left: { type: 'number', description: 'Left position in pixels (from canvas left)', default: 0 },
      },
      required: ['layoutId', 'width', 'height'],
    },
  },
  async handler(cms, input) {
    const result = await cms.addRegion(input.layoutId, {
      width: input.width,
      height: input.height,
      top: input.top || 0,
      left: input.left || 0,
      name: input.name || '',
    });
    return {
      regionId: result.regionId,
      playlistId: result.playlists?.[0]?.playlistId,
      width: result.width,
      height: result.height,
    };
  },
};

// ── Tool: add_text_widget ─────────────────────────────────────────

const addTextWidget = {
  definition: {
    name: 'add_text_widget',
    description: 'Add a text widget to a region. Supports HTML content with inline CSS for formatting. The text can include rich formatting like headings, colors, and fonts.',
    input_schema: {
      type: 'object',
      properties: {
        playlistId: { type: 'number', description: 'Playlist ID of the target region (from create_layout or add_region response)' },
        text: { type: 'string', description: 'HTML text content. Can include tags like <h1>, <p>, <span style="color:red">, etc.' },
        duration: { type: 'number', description: 'Display duration in seconds (default 10)', default: 10 },
        name: { type: 'string', description: 'Optional widget name' },
      },
      required: ['playlistId', 'text'],
    },
  },
  async handler(cms, input) {
    const params = {
      duration: input.duration || 10,
      useDuration: 1,
      name: input.name || '',
      ta_text_advanced: 0,
      text: input.text,
    };
    const result = await cms.addWidget('text', input.playlistId, params);
    return { widgetId: result.widgetId, type: 'text', duration: params.duration };
  },
};

// ── Tool: add_image_widget ────────────────────────────────────────

const addImageWidget = {
  definition: {
    name: 'add_image_widget',
    description: 'Add an image widget to a region using a media library item. First search for the image using list_media or upload it, then use its mediaId here.',
    input_schema: {
      type: 'object',
      properties: {
        playlistId: { type: 'number', description: 'Playlist ID of the target region' },
        mediaId: { type: 'number', description: 'Media library ID of the image' },
        duration: { type: 'number', description: 'Display duration in seconds (default 10)', default: 10 },
        scaleType: { type: 'string', description: 'How to fit image: "center" (fit), "stretch" (fill)', default: 'center' },
      },
      required: ['playlistId', 'mediaId'],
    },
  },
  async handler(cms, input) {
    const result = await cms.addWidget('image', input.playlistId, {
      duration: input.duration || 10,
      useDuration: 1,
      scaleTypeId: input.scaleType || 'center',
      mediaId: input.mediaId,
    });
    return { widgetId: result.widgetId, type: 'image', mediaId: input.mediaId };
  },
};

// ── Tool: add_video_widget ────────────────────────────────────────

const addVideoWidget = {
  definition: {
    name: 'add_video_widget',
    description: 'Add a video widget to a region using a media library item. The video duration is auto-detected unless overridden.',
    input_schema: {
      type: 'object',
      properties: {
        playlistId: { type: 'number', description: 'Playlist ID of the target region' },
        mediaId: { type: 'number', description: 'Media library ID of the video' },
        duration: { type: 'number', description: 'Override duration in seconds (0 = use video length)', default: 0 },
        mute: { type: 'boolean', description: 'Mute audio (default false)', default: false },
        loop: { type: 'boolean', description: 'Loop video (default false)', default: false },
      },
      required: ['playlistId', 'mediaId'],
    },
  },
  async handler(cms, input) {
    const result = await cms.addWidget('video', input.playlistId, {
      duration: input.duration || 0,
      useDuration: input.duration > 0 ? 1 : 0,
      mediaId: input.mediaId,
      mute: input.mute ? 1 : 0,
      loop: input.loop ? 1 : 0,
    });
    return { widgetId: result.widgetId, type: 'video', mediaId: input.mediaId };
  },
};

// ── Tool: add_clock_widget ────────────────────────────────────────

const addClockWidget = {
  definition: {
    name: 'add_clock_widget',
    description: 'Add a clock/date widget to a region. Supports digital and analog clock styles with customizable format.',
    input_schema: {
      type: 'object',
      properties: {
        playlistId: { type: 'number', description: 'Playlist ID of the target region' },
        duration: { type: 'number', description: 'Display duration in seconds (default 60)', default: 60 },
        clockType: { type: 'number', description: '1 = analog, 2 = digital, 3 = flip clock', default: 2 },
        format: { type: 'string', description: 'Time format string (e.g. "HH:mm:ss", "DD/MM/YYYY HH:mm")', default: 'HH:mm' },
      },
      required: ['playlistId'],
    },
  },
  async handler(cms, input) {
    const result = await cms.addWidget('clock', input.playlistId, {
      duration: input.duration || 60,
      useDuration: 1,
      clockTypeId: input.clockType || 2,
      format: input.format || 'HH:mm',
    });
    return { widgetId: result.widgetId, type: 'clock' };
  },
};

// ── Tool: add_embedded_widget ─────────────────────────────────────

const addEmbeddedWidget = {
  definition: {
    name: 'add_embedded_widget',
    description: 'Add custom HTML/CSS/JS content as an embedded widget. Useful for custom content, animations, or web-based elements that are not covered by standard widget types.',
    input_schema: {
      type: 'object',
      properties: {
        playlistId: { type: 'number', description: 'Playlist ID of the target region' },
        html: { type: 'string', description: 'HTML content to embed' },
        css: { type: 'string', description: 'Optional CSS styles' },
        javascript: { type: 'string', description: 'Optional JavaScript code' },
        duration: { type: 'number', description: 'Display duration in seconds (default 30)', default: 30 },
        isTransparent: { type: 'boolean', description: 'Transparent background (default false)', default: false },
        name: { type: 'string', description: 'Optional widget name' },
      },
      required: ['playlistId', 'html'],
    },
  },
  async handler(cms, input) {
    const result = await cms.addWidget('embedded', input.playlistId, {
      duration: input.duration || 30,
      useDuration: 1,
      transparency: input.isTransparent ? 1 : 0,
      embedHtml: input.html,
      embedStyle: input.css || '',
      embedScript: input.javascript || '',
      name: input.name || '',
    });
    return { widgetId: result.widgetId, type: 'embedded' };
  },
};

// ── Tool: publish_layout ──────────────────────────────────────────

const publishLayout = {
  definition: {
    name: 'publish_layout',
    description: 'Publish a draft layout to make it available for scheduling. Layouts must be published before they can be displayed on screens.',
    input_schema: {
      type: 'object',
      properties: {
        layoutId: { type: 'number', description: 'Layout ID to publish' },
      },
      required: ['layoutId'],
    },
  },
  async handler(cms, input) {
    await cms.publishLayout(input.layoutId);
    return { layoutId: input.layoutId, status: 'published' };
  },
};

// ── Tool: list_media ──────────────────────────────────────────────

const listMedia = {
  definition: {
    name: 'list_media',
    description: 'Search the media library for images, videos, and other files. Returns media ID, name, type, and file size. Use this to find existing media before adding it to layouts.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term to filter by name' },
        type: { type: 'string', description: 'Filter by media type: "image", "video", "audio", "font"' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
    },
  },
  async handler(cms, input) {
    const params = { length: input.limit || 10 };
    if (input.search) params.media = input.search;
    if (input.type) params.type = input.type;
    const media = await cms.listMedia(params);
    return media.map(m => ({
      mediaId: m.mediaId,
      name: m.name,
      type: m.mediaType,
      fileName: m.fileName,
      fileSize: m.fileSize,
      tags: m.tags,
    }));
  },
};

// ── Tool: create_campaign ─────────────────────────────────────────

const createCampaign = {
  definition: {
    name: 'create_campaign',
    description: 'Create a campaign to group multiple layouts together. Campaigns are the scheduling unit — you schedule a campaign (which contains layouts) to display groups.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name (e.g. "Winter Sale 2026")' },
      },
      required: ['name'],
    },
  },
  async handler(cms, input) {
    const result = await cms.createCampaign(input.name);
    return { campaignId: result.campaignId, name: result.campaign };
  },
};

// ── Tool: assign_layout_to_campaign ───────────────────────────────

const assignLayoutToCampaign = {
  definition: {
    name: 'assign_layout_to_campaign',
    description: 'Add a published layout to a campaign. Layouts play in the order they are assigned (displayOrder). A campaign can contain multiple layouts that cycle through.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'number', description: 'Campaign ID' },
        layoutId: { type: 'number', description: 'Layout ID to add (must be published)' },
        displayOrder: { type: 'number', description: 'Position in playlist (1 = first)', default: 1 },
      },
      required: ['campaignId', 'layoutId'],
    },
  },
  async handler(cms, input) {
    await cms.assignLayoutToCampaign(input.campaignId, input.layoutId, input.displayOrder || 1);
    return { campaignId: input.campaignId, layoutId: input.layoutId, displayOrder: input.displayOrder || 1 };
  },
};

// ── Tool: schedule_campaign ───────────────────────────────────────

const scheduleCampaign = {
  definition: {
    name: 'schedule_campaign',
    description: 'Schedule a campaign or layout to play on display groups during a time range. Set priority to control which content takes precedence (higher = shows first). Use "always" daypart for 24/7 display.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'number', description: 'Campaign ID to schedule (use this OR layoutId)' },
        layoutId: { type: 'number', description: 'Layout ID to schedule directly (use this OR campaignId)' },
        displayGroupIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of display group IDs to show content on',
        },
        fromDt: { type: 'string', description: 'Start date/time in "YYYY-MM-DD HH:mm:ss" format' },
        toDt: { type: 'string', description: 'End date/time in "YYYY-MM-DD HH:mm:ss" format' },
        priority: { type: 'number', description: 'Display priority (0 = normal, higher = takes precedence)', default: 0 },
        isPriority: { type: 'boolean', description: 'If true, interrupts lower-priority content', default: false },
        recurrenceType: { type: 'string', description: 'Repeat: "day", "week", "month", "year" (omit for one-time)' },
        dayPartId: { type: 'number', description: 'Day part ID for time-of-day rules (0 = always)' },
      },
      required: ['displayGroupIds'],
    },
  },
  async handler(cms, input) {
    const params = {
      'displayGroupIds[]': input.displayGroupIds,
      priority: input.priority || 0,
      isPriority: input.isPriority ? 1 : 0,
    };
    if (input.campaignId) params.campaignId = input.campaignId;
    if (input.layoutId) params.layoutId = input.layoutId;
    if (input.fromDt) params.fromDt = input.fromDt;
    if (input.toDt) params.toDt = input.toDt;
    if (input.recurrenceType) params.recurrenceType = input.recurrenceType;
    if (input.dayPartId) params.dayPartId = input.dayPartId;
    const result = await cms.createSchedule(params);
    return { eventId: result.eventId || result.id, scheduled: true };
  },
};

// ── Tool: list_displays ───────────────────────────────────────────

const listDisplays = {
  definition: {
    name: 'list_displays',
    description: 'List registered display screens. Shows display ID, name, status (online/offline), last seen time, and assigned display groups.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by display name' },
      },
    },
  },
  async handler(cms, input) {
    const params = {};
    if (input.search) params.display = input.search;
    const displays = await cms.listDisplays(params);
    return displays.map(d => ({
      displayId: d.displayId,
      name: d.display,
      loggedIn: d.loggedIn === 1,
      lastAccessed: d.lastAccessed,
      licensed: d.licensed === 1,
      displayGroupId: d.displayGroupId,
    }));
  },
};

// ── Tool: list_display_groups ─────────────────────────────────────

const listDisplayGroups = {
  definition: {
    name: 'list_display_groups',
    description: 'List display groups. Display groups are the target for scheduling — you assign content to groups, not individual displays. Each display also has its own auto-created group.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by group name' },
      },
    },
  },
  async handler(cms, input) {
    const params = {};
    if (input.search) params.displayGroup = input.search;
    const groups = await cms.listDisplayGroups(params);
    return groups.map(g => ({
      displayGroupId: g.displayGroupId,
      name: g.displayGroup,
      description: g.description,
      isDynamic: g.isDynamic === 1,
    }));
  },
};

// ── Tool: list_templates ──────────────────────────────────────────

const listTemplates = {
  definition: {
    name: 'list_templates',
    description: 'List available layout templates. Templates are pre-designed layouts that can be used as starting points for new content.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by template name' },
      },
    },
  },
  async handler(cms, input) {
    const params = {};
    if (input.search) params.layout = input.search;
    const templates = await cms.listTemplates(params);
    return templates.map(t => ({
      templateId: t.layoutId,
      name: t.layout,
      description: t.description,
      width: t.width,
      height: t.height,
      tags: t.tags,
    }));
  },
};

// ── Export all tools ───────────────────────────────────────────────

export const CMS_TOOLS = [
  listLayouts,
  createLayout,
  addRegion,
  addTextWidget,
  addImageWidget,
  addVideoWidget,
  addClockWidget,
  addEmbeddedWidget,
  publishLayout,
  listMedia,
  createCampaign,
  assignLayoutToCampaign,
  scheduleCampaign,
  listDisplays,
  listDisplayGroups,
  listTemplates,
];

/**
 * Get tool definitions array for Claude API.
 * @returns {Array} Tool definitions compatible with Claude tool-use format
 */
export function getToolDefinitions() {
  return CMS_TOOLS.map(t => t.definition);
}

/**
 * Execute a tool by name.
 * @param {string} name - Tool name
 * @param {CmsApiClient} cmsApi - Authenticated CMS API client
 * @param {Object} input - Tool input parameters
 * @returns {Promise<Object>} Tool result
 */
export async function executeTool(name, cmsApi, input) {
  const tool = CMS_TOOLS.find(t => t.definition.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(cmsApi, input);
}
