/**
 * CMS API Client — OAuth2-authenticated REST client for Xibo CMS
 *
 * Provides display management capabilities via the CMS REST API.
 * Implements OAuth2 client_credentials flow (machine-to-machine).
 *
 * Usage:
 *   const api = new CmsApiClient({ baseUrl: 'https://cms.example.com', clientId, clientSecret });
 *   await api.authenticate();
 *   const display = await api.findDisplay(hardwareKey);
 *   await api.authorizeDisplay(display.displayId);
 */

import { createLogger } from './logger.js';

const log = createLogger('CmsApi');

export class CmsApiClient {
  /**
   * @param {Object} options
   * @param {string} options.baseUrl - CMS base URL (e.g. https://cms.example.com)
   * @param {string} options.clientId - OAuth2 application client ID
   * @param {string} options.clientSecret - OAuth2 application client secret
   */
  constructor({ baseUrl, clientId, clientSecret }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  // ── OAuth2 Token Management ─────────────────────────────────────

  /**
   * Authenticate using client_credentials grant
   * @returns {Promise<string>} Access token
   */
  async authenticate() {
    log.info('Authenticating with CMS API...');

    const response = await fetch(`${this.baseUrl}/api/authorize/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OAuth2 authentication failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

    log.info('Authenticated successfully, token expires in', data.expires_in, 's');
    return this.accessToken;
  }

  /**
   * Ensure we have a valid token (auto-refresh if expired)
   */
  async ensureToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry - 60000) {
      await this.authenticate();
    }
  }

  /**
   * Make an authenticated API request
   * @param {string} method - HTTP method
   * @param {string} path - API path (e.g. /display)
   * @param {Object} [params] - Query params (GET) or body params (POST/PUT)
   * @returns {Promise<any>} Response data
   */
  async request(method, path, params = {}) {
    await this.ensureToken();

    const url = new URL(`${this.baseUrl}/api${path}`);
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    };

    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    } else {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = new URLSearchParams(params);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      let errorMsg;
      try {
        const errorData = JSON.parse(text);
        errorMsg = errorData.error?.message || errorData.message || text;
      } catch (_) {
        errorMsg = text;
      }
      throw new Error(`CMS API ${method} ${path} failed (${response.status}): ${errorMsg}`);
    }

    // Some endpoints return empty body (204)
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return null;
  }

  // ── Display Management ──────────────────────────────────────────

  /**
   * Find a display by hardware key
   * @param {string} hardwareKey
   * @returns {Promise<Object|null>} Display object or null if not found
   */
  async findDisplay(hardwareKey) {
    log.info('Looking up display by hardwareKey:', hardwareKey);
    const data = await this.request('GET', '/display', { hardwareKey });

    // API returns array of matching displays
    const displays = Array.isArray(data) ? data : [];
    if (displays.length === 0) {
      log.info('No display found for hardwareKey:', hardwareKey);
      return null;
    }

    const display = displays[0];
    log.info(`Found display: ${display.display} (ID: ${display.displayId}, licensed: ${display.licensed})`);
    return display;
  }

  /**
   * Authorize (toggle licence) a display
   * @param {number} displayId
   * @returns {Promise<void>}
   */
  async authorizeDisplay(displayId) {
    log.info('Authorizing display:', displayId);
    await this.request('PUT', `/display/authorise/${displayId}`);
    log.info('Display authorized successfully');
  }

  /**
   * Edit display properties
   * @param {number} displayId
   * @param {Object} properties - Properties to update (display, description, defaultLayoutId, etc.)
   * @returns {Promise<Object>} Updated display
   */
  async editDisplay(displayId, properties) {
    log.info('Editing display:', displayId, properties);
    return this.request('PUT', `/display/${displayId}`, properties);
  }

  /**
   * List all displays (with optional filters)
   * @param {Object} [filters] - Optional filters (displayId, display, macAddress, hardwareKey, clientType)
   * @returns {Promise<Array>} Array of display objects
   */
  async listDisplays(filters = {}) {
    const data = await this.request('GET', '/display', filters);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Request screenshot from a display
   * @param {number} displayId
   * @returns {Promise<void>}
   */
  async requestScreenshot(displayId) {
    await this.request('PUT', `/display/requestscreenshot/${displayId}`);
  }

  /**
   * Get display status
   * @param {number} displayId
   * @returns {Promise<Object>}
   */
  async getDisplayStatus(displayId) {
    return this.request('GET', `/display/status/${displayId}`);
  }
}
