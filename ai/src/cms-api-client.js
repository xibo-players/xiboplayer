/**
 * CMS REST API Client
 *
 * Authenticated HTTP client for Xibo CMS REST API.
 * Supports OAuth2 client_credentials flow and pre-configured bearer tokens.
 *
 * @module @xiboplayer/ai/cms-api
 */

export class CmsApiClient {
  /**
   * @param {Object} options
   * @param {string} options.cmsUrl - CMS base URL (e.g. "https://cms.example.com")
   * @param {string} [options.clientId] - OAuth2 client ID
   * @param {string} [options.clientSecret] - OAuth2 client secret
   * @param {string} [options.apiToken] - Pre-configured bearer token (skips OAuth2 flow)
   */
  constructor(options) {
    this.cmsUrl = options.cmsUrl.replace(/\/$/, '');
    this.clientId = options.clientId || null;
    this.clientSecret = options.clientSecret || null;
    this._token = options.apiToken || null;
    this._tokenExpiry = options.apiToken ? Infinity : 0;
  }

  // ── Authentication ───────────────────────────────────────────────

  async _ensureToken() {
    if (this._token && Date.now() < this._tokenExpiry - 30000) return;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('CMS API: No valid token and no OAuth2 credentials configured');
    }

    const res = await fetch(`${this.cmsUrl}/api/authorize/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CMS OAuth2 failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    this._token = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  }

  /**
   * Make an authenticated API request.
   * @param {string} method - HTTP method
   * @param {string} path - API path (e.g. "/api/layout")
   * @param {Object} [body] - Request body (JSON or FormData)
   * @returns {Promise<Object>} Parsed JSON response
   */
  async request(method, path, body = null) {
    await this._ensureToken();

    const url = `${this.cmsUrl}${path}`;
    const headers = { Authorization: `Bearer ${this._token}` };

    const opts = { method, headers };

    if (body) {
      if (body instanceof FormData) {
        opts.body = body;
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        opts.body = new URLSearchParams(body);
      }
    }

    const res = await fetch(url, opts);
    const text = await res.text();

    if (!res.ok) {
      let detail = text;
      try { detail = JSON.parse(text).message || text; } catch {}
      throw new CmsApiError(method, path, res.status, detail);
    }

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  // ── Convenience methods ──────────────────────────────────────────

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  del(path) { return this.request('DELETE', path); }

  // ── Layout API ───────────────────────────────────────────────────

  async listLayouts(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/layout?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  async createLayout(name, opts = {}) {
    const params = { name };
    if (opts.resolutionId) {
      params.resolutionId = opts.resolutionId;
    } else {
      params.width = opts.width || 1920;
      params.height = opts.height || 1080;
    }
    if (opts.backgroundColor) params.backgroundColor = opts.backgroundColor;
    if (opts.description) params.description = opts.description;
    return this.post('/api/layout', params);
  }

  async publishLayout(layoutId) {
    return this.put(`/api/layout/publish/${layoutId}`, { publishNow: 1 });
  }

  async checkoutLayout(layoutId) {
    return this.put(`/api/layout/checkout/${layoutId}`);
  }

  async getLayoutStatus(layoutId) {
    return this.get(`/api/layout/status/${layoutId}`);
  }

  // ── Region API ───────────────────────────────────────────────────

  async addRegion(layoutId, { width = 1920, height = 1080, top = 0, left = 0, type = 'frame', name = '' } = {}) {
    return this.post(`/api/region/${layoutId}`, { width, height, top, left, type, name });
  }

  async editRegion(regionId, params) {
    return this.put(`/api/region/${regionId}`, params);
  }

  // ── Widget API ───────────────────────────────────────────────────

  async addWidget(type, playlistId, params = {}) {
    return this.post(`/api/playlist/widget/${type}/${playlistId}`, params);
  }

  async editWidget(widgetId, params) {
    return this.put(`/api/playlist/widget/${widgetId}`, params);
  }

  // ── Playlist API ─────────────────────────────────────────────────

  async assignMediaToPlaylist(playlistId, mediaIds) {
    return this.post(`/api/playlist/library/assign/${playlistId}`, {
      'media[]': Array.isArray(mediaIds) ? mediaIds : [mediaIds],
    });
  }

  // ── Media Library API ────────────────────────────────────────────

  async listMedia(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/library?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  async uploadMediaFromUrl(url, name) {
    return this.post('/api/library/uploadUrl', { url, name });
  }

  // ── Campaign API ─────────────────────────────────────────────────

  async listCampaigns(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/campaign?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  async createCampaign(name) {
    return this.post('/api/campaign', { name });
  }

  async assignLayoutToCampaign(campaignId, layoutId, displayOrder = 1) {
    return this.post(`/api/campaign/layout/assign/${campaignId}`, {
      'layoutId[]': layoutId,
      'displayOrder[]': displayOrder,
    });
  }

  // ── Schedule API ─────────────────────────────────────────────────

  async createSchedule(params) {
    return this.post('/api/schedule', params);
  }

  async listSchedules(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/schedule?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  // ── Display API ──────────────────────────────────────────────────

  async listDisplays(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/display?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  async listDisplayGroups(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/displaygroup?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  // ── Template API ─────────────────────────────────────────────────

  async listTemplates(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/template?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  // ── Resolution API ──────────────────────────────────────────────

  async listResolutions(params = {}) {
    const qs = new URLSearchParams(params);
    const data = await this.get(`/api/resolution?${qs}`);
    return Array.isArray(data) ? data : data.data || data;
  }

  // ── Xibo v4 Draft Layout ─────────────────────────────────────────

  /**
   * Get the draft (editable) layout for a parent layout.
   * Xibo v4: POST /api/layout creates parent + hidden draft.
   * Add regions/widgets to the draft, publish via parent ID.
   */
  async getDraftLayout(parentId) {
    const qs = new URLSearchParams({ parentId });
    const data = await this.get(`/api/layout?${qs}`);
    const layouts = Array.isArray(data) ? data : data.data || [];
    return layouts.length > 0 ? layouts[0] : null;
  }

  // ── Delete operations ─────────────────────────────────────────────

  async deleteLayout(layoutId) {
    return this.request('DELETE', `/api/layout/${layoutId}`);
  }

  async deleteWidget(widgetId) {
    return this.request('DELETE', `/api/playlist/widget/${widgetId}`);
  }

  async deleteCampaign(campaignId) {
    return this.request('DELETE', `/api/campaign/${campaignId}`);
  }

  async deleteSchedule(eventId) {
    return this.request('DELETE', `/api/schedule/${eventId}`);
  }

  async deleteMedia(mediaId) {
    return this.request('DELETE', `/api/library/${mediaId}`);
  }

  async deleteRegion(regionId) {
    return this.request('DELETE', `/api/region/${regionId}`);
  }

  // ── Edit operations ───────────────────────────────────────────────

  async editWidget(widgetId, params) {
    return this.put(`/api/playlist/widget/${widgetId}`, params);
  }

  async editRegion(regionId, params) {
    return this.put(`/api/region/${regionId}`, params);
  }

  async editLayout(layoutId, params) {
    return this.put(`/api/layout/${layoutId}`, params);
  }
}

export class CmsApiError extends Error {
  constructor(method, path, status, detail) {
    super(`CMS API ${method} ${path} → ${status}: ${detail}`);
    this.name = 'CmsApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.detail = detail;
  }
}
