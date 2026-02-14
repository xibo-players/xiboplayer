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

  async createLayout(name, { width = 1920, height = 1080, backgroundColor = '#000000', description = '' } = {}) {
    return this.post('/api/layout', { name, width, height, backgroundColor, description });
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
