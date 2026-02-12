/**
 * XMDS client with dual transport: SOAP (default) and REST
 *
 * Set config.useRestApi = true to use the REST transport.
 * Both transports return identical data structures, so consumer
 * code works unchanged regardless of transport.
 *
 * REST benefits:
 *  - ~30% smaller payloads (no SOAP envelope overhead)
 *  - ETag-based HTTP caching (304 Not Modified on unchanged data)
 *  - Standard HTTP methods and status codes
 *  - JSON input for logs/stats (no XML construction needed)
 *
 * Protocol: https://github.com/linuxnow/xibo_players_docs
 */
import { createLogger, fetchWithRetry } from '@xiboplayer/utils';

const log = createLogger('XMDS');

export class XmdsClient {
  constructor(config) {
    this.config = config;
    this.schemaVersion = 5;
    this.retryOptions = config.retryOptions || { maxRetries: 2, baseDelayMs: 2000 };

    // REST transport
    this.useRest = config.useRestApi === true;
    this._etags = new Map();         // endpoint → ETag string
    this._responseCache = new Map(); // endpoint → cached parsed response

    if (this.useRest) {
      log.info('Using REST transport');
    }
  }

  // ─── REST transport helpers ────────────────────────────────────────

  /**
   * Get the REST API base URL.
   * Falls back to /player/ path relative to the CMS address.
   */
  getRestBaseUrl() {
    const base = this.config.restApiUrl || `${this.config.cmsAddress}/player`;
    return base.replace(/\/+$/, '');
  }

  /**
   * Make a REST GET request with optional ETag caching.
   * Returns the parsed JSON body, or cached data on 304.
   */
  async restGet(path, queryParams = {}) {
    const url = new URL(`${this.getRestBaseUrl()}${path}`);
    url.searchParams.set('serverKey', this.config.cmsKey);
    url.searchParams.set('hardwareKey', this.config.hardwareKey);
    url.searchParams.set('v', String(this.schemaVersion));
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, String(value));
    }

    const cacheKey = path;
    const headers = {};
    const cachedEtag = this._etags.get(cacheKey);
    if (cachedEtag) {
      headers['If-None-Match'] = cachedEtag;
    }

    log.debug(`REST GET ${path}`, queryParams);

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers,
    }, this.retryOptions);

    // 304 Not Modified — return cached response
    if (response.status === 304) {
      const cached = this._responseCache.get(cacheKey);
      if (cached) {
        log.debug(`REST ${path} → 304 (using cache)`);
        return cached;
      }
      // Cache miss despite 304 — fall through to fetch fresh
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`REST GET ${path} failed: ${response.status} ${response.statusText} ${errorBody}`);
    }

    // Store ETag for future requests
    const etag = response.headers.get('ETag');
    if (etag) {
      this._etags.set(cacheKey, etag);
    }

    const contentType = response.headers.get('Content-Type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // XML or HTML — return raw text
      data = await response.text();
    }

    // Cache parsed response for 304 reuse
    this._responseCache.set(cacheKey, data);
    return data;
  }

  /**
   * Make a REST POST/PUT request with JSON body.
   * Returns the parsed JSON response.
   */
  async restSend(method, path, body = {}) {
    const url = new URL(`${this.getRestBaseUrl()}${path}`);
    url.searchParams.set('v', String(this.schemaVersion));

    log.debug(`REST ${method} ${path}`);

    const response = await fetchWithRetry(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverKey: this.config.cmsKey,
        hardwareKey: this.config.hardwareKey,
        ...body,
      }),
    }, this.retryOptions);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`REST ${method} ${path} failed: ${response.status} ${response.statusText} ${errorBody}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  }

  // ─── SOAP transport (unchanged) ───────────────────────────────────

  /**
   * Build SOAP envelope for a given method and parameters
   */
  buildEnvelope(method, params) {
    const paramElements = Object.entries(params)
      .map(([key, value]) => {
        const escaped = String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        return `<${key} xsi:type="xsd:string">${escaped}</${key}>`;
      })
      .join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope
    xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:tns="urn:xmds"
    xmlns:types="urn:xmds/encodedTypes"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body soap:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
    <tns:${method}>
      ${paramElements}
    </tns:${method}>
  </soap:Body>
</soap:Envelope>`;
  }

  /**
   * Rewrite XMDS URL for Electron proxy
   * If running in Electron (localhost), use local proxy to avoid CORS
   */
  rewriteXmdsUrl(cmsUrl) {
    // Detect Electron environment (running on localhost)
    if (typeof window !== 'undefined' &&
        window.location.hostname === 'localhost' &&
        window.location.port === '8765') {

      // Use local proxy endpoint and pass CMS URL as query parameter
      const encodedCmsUrl = encodeURIComponent(cmsUrl);
      return `/xmds-proxy?cms=${encodedCmsUrl}`;
    }

    // Running in browser - use direct CMS URL
    return `${cmsUrl}/xmds.php`;
  }

  /**
   * Call XMDS SOAP method
   */
  async call(method, params = {}) {
    const xmdsUrl = this.rewriteXmdsUrl(this.config.cmsAddress);
    const url = `${xmdsUrl}${xmdsUrl.includes('?') ? '&' : '?'}v=${this.schemaVersion}`;
    const body = this.buildEnvelope(method, params);

    log.debug(`${method}`, params);
    log.debug(`URL: ${url}`);

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8'
      },
      body
    }, this.retryOptions);

    if (!response.ok) {
      throw new Error(`XMDS ${method} failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return this.parseResponse(xml, method);
  }

  /**
   * Parse SOAP response
   */
  parseResponse(xml, method) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for SOAP fault (handle namespace prefix like soap:Fault)
    let fault = doc.querySelector('Fault');
    if (!fault) {
      fault = Array.from(doc.querySelectorAll('*')).find(
        el => el.localName === 'Fault' || el.tagName.endsWith(':Fault')
      );
    }
    if (fault) {
      const faultString = fault.querySelector('faultstring')?.textContent
        || Array.from(fault.querySelectorAll('*')).find(el => el.localName === 'faultstring')?.textContent
        || 'Unknown SOAP fault';
      throw new Error(`SOAP Fault: ${faultString}`);
    }

    // Extract response element (handle namespace prefixes like ns1:MethodResponse)
    const responseTag = `${method}Response`;
    let responseEl = doc.querySelector(responseTag);
    if (!responseEl) {
      // Fallback: search by localName to handle ns1:MethodResponse etc.
      responseEl = Array.from(doc.querySelectorAll('*')).find(
        el => el.localName === responseTag || el.tagName.endsWith(':' + responseTag)
      );
    }

    if (!responseEl) {
      throw new Error(`No ${responseTag} element in SOAP response`);
    }

    // Get first child element (the return value)
    const returnEl = responseEl.firstElementChild;
    if (!returnEl) {
      return null;
    }

    return returnEl.textContent;
  }

  // ─── Public API (transport-agnostic) ──────────────────────────────

  /**
   * RegisterDisplay - authenticate and get settings
   */
  async registerDisplay() {
    if (this.useRest) {
      return this._restRegisterDisplay();
    }

    const os = `${navigator.platform} ${navigator.userAgent}`;

    const xml = await this.call('RegisterDisplay', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      displayName: this.config.displayName,
      clientType: 'chromeOS',  // PWA player (enables /pwa/ endpoints)
      clientVersion: '0.1.0',
      clientCode: '1',
      operatingSystem: os,
      macAddress: 'n/a',
      xmrChannel: this.config.xmrChannel,
      xmrPubKey: ''  // TODO: generate RSA key for XMR
    });

    return this.parseRegisterDisplayResponse(xml);
  }

  /**
   * REST: RegisterDisplay
   * POST /register → JSON with display settings
   */
  async _restRegisterDisplay() {
    const os = typeof navigator !== 'undefined'
      ? `${navigator.platform} ${navigator.userAgent}`
      : 'unknown';

    const json = await this.restSend('POST', '/register', {
      displayName: this.config.displayName,
      clientType: 'chromeOS',
      clientVersion: '0.1.0',
      clientCode: 1,
      operatingSystem: os,
      macAddress: 'n/a',
      xmrChannel: this.config.xmrChannel,
      xmrPubKey: '',
    });

    // REST returns JSON from SimpleXMLElement conversion.
    // The CMS converts <display code="READY" message="..."><settingName>value</settingName>...</display>
    // to JSON: {"@attributes":{"code":"READY","message":"..."},"settingName":"value",...}
    return this._parseRegisterDisplayJson(json);
  }

  /**
   * Parse REST JSON RegisterDisplay response into the same format as SOAP.
   */
  _parseRegisterDisplayJson(json) {
    // Handle both direct object and wrapped {display: ...} forms
    const display = json.display || json;
    const attrs = display['@attributes'] || {};
    const code = attrs.code || display.code;
    const message = attrs.message || display.message || '';

    if (code !== 'READY') {
      return { code, message, settings: null };
    }

    const settings = {};
    for (const [key, value] of Object.entries(display)) {
      if (key === '@attributes' || key === 'commands' || key === 'file') continue;
      settings[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    const checkRf = attrs.checkRf || '';
    const checkSchedule = attrs.checkSchedule || '';

    return { code, message, settings, checkRf, checkSchedule };
  }

  /**
   * Parse RegisterDisplay XML response
   */
  parseRegisterDisplayResponse(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const display = doc.querySelector('display');
    if (!display) {
      throw new Error('Invalid RegisterDisplay response: no <display> element');
    }

    const code = display.getAttribute('code');
    const message = display.getAttribute('message');

    if (code !== 'READY') {
      return { code, message, settings: null };
    }

    // Parse settings - CMS sends them directly as children of <display>, not wrapped in <settingsNodes>
    const settings = {};
    for (const child of display.children) {
      // Skip known non-setting elements
      if (!['commands', 'file'].includes(child.tagName.toLowerCase())) {
        settings[child.tagName] = child.textContent;
      }
    }

    // Extract CRC32 checksums for RequiredFiles and Schedule skip optimization
    const checkRf = display.getAttribute('checkRf') || '';
    const checkSchedule = display.getAttribute('checkSchedule') || '';

    return { code, message, settings, checkRf, checkSchedule };
  }

  /**
   * RequiredFiles - get list of files to download
   */
  async requiredFiles() {
    if (this.useRest) {
      return this._restRequiredFiles();
    }

    const xml = await this.call('RequiredFiles', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey
    });

    return this.parseRequiredFilesResponse(xml);
  }

  /**
   * REST: RequiredFiles
   * GET /requiredFiles → JSON file manifest (with ETag caching)
   */
  async _restRequiredFiles() {
    const json = await this.restGet('/requiredFiles');

    // CMS converts <files><file type="..." id="..." .../></files> to JSON.
    // PHP json_encode(SimpleXMLElement) produces:
    //   {"file": [{"@attributes": {"type":"media","id":"42",...}}, ...]}
    // or for single file: {"file": {"@attributes": {...}}}
    return this._parseRequiredFilesJson(json);
  }

  /**
   * Parse REST JSON RequiredFiles into the same array format as SOAP.
   */
  _parseRequiredFilesJson(json) {
    const files = [];
    let fileList = json.file || [];

    // Normalize single item to array
    if (!Array.isArray(fileList)) {
      fileList = [fileList];
    }

    for (const f of fileList) {
      const attrs = f['@attributes'] || f;
      files.push({
        type: attrs.type || null,
        id: attrs.id || null,
        size: parseInt(attrs.size || '0'),
        md5: attrs.md5 || null,
        download: attrs.download || null,
        path: attrs.path || null,
        code: attrs.code || null,
        layoutid: attrs.layoutid || null,
        regionid: attrs.regionid || null,
        mediaid: attrs.mediaid || null,
      });
    }

    return files;
  }

  /**
   * Parse RequiredFiles XML response
   */
  parseRequiredFilesResponse(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const files = [];
    for (const fileEl of doc.querySelectorAll('file')) {
      files.push({
        type: fileEl.getAttribute('type'),
        id: fileEl.getAttribute('id'),
        size: parseInt(fileEl.getAttribute('size') || '0'),
        md5: fileEl.getAttribute('md5'),
        download: fileEl.getAttribute('download'),
        path: fileEl.getAttribute('path'),
        code: fileEl.getAttribute('code'),
        layoutid: fileEl.getAttribute('layoutid'),
        regionid: fileEl.getAttribute('regionid'),
        mediaid: fileEl.getAttribute('mediaid')
      });
    }

    return files;
  }

  /**
   * Schedule - get layout schedule
   */
  async schedule() {
    if (this.useRest) {
      return this._restSchedule();
    }

    const xml = await this.call('Schedule', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey
    });

    return this.parseScheduleResponse(xml);
  }

  /**
   * REST: Schedule
   * GET /schedule → XML (preserved for layout parser compatibility, with ETag caching)
   */
  async _restSchedule() {
    // Schedule endpoint returns XML even on REST (complex nested structure)
    const xml = await this.restGet('/schedule');
    return this.parseScheduleResponse(xml);
  }

  /**
   * Parse Schedule XML response
   */
  parseScheduleResponse(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    const schedule = {
      default: null,
      layouts: [],
      campaigns: [],
      overlays: [],
      actions: [],
      commands: [],
      dataConnectors: []
    };

    const defaultEl = doc.querySelector('default');
    if (defaultEl) {
      schedule.default = defaultEl.getAttribute('file');
    }

    // Parse campaigns (groups of layouts with shared priority)
    for (const campaignEl of doc.querySelectorAll('campaign')) {
      const campaign = {
        id: campaignEl.getAttribute('id'),
        priority: parseInt(campaignEl.getAttribute('priority') || '0'),
        fromdt: campaignEl.getAttribute('fromdt'),
        todt: campaignEl.getAttribute('todt'),
        scheduleid: campaignEl.getAttribute('scheduleid'),
        layouts: []
      };

      // Parse layouts within this campaign
      for (const layoutEl of campaignEl.querySelectorAll('layout')) {
        const fileId = layoutEl.getAttribute('file');
        campaign.layouts.push({
          id: String(fileId), // Normalized string ID for consistent type usage
          file: fileId,
          // Layouts in campaigns inherit timing from campaign level
          fromdt: layoutEl.getAttribute('fromdt') || campaign.fromdt,
          todt: layoutEl.getAttribute('todt') || campaign.todt,
          scheduleid: campaign.scheduleid,
          priority: campaign.priority, // Priority at campaign level
          campaignId: campaign.id,
          maxPlaysPerHour: parseInt(layoutEl.getAttribute('maxPlaysPerHour') || '0')
        });
      }

      schedule.campaigns.push(campaign);
    }

    // Parse standalone layouts (not in campaigns)
    for (const layoutEl of doc.querySelectorAll('schedule > layout')) {
      const fileId = layoutEl.getAttribute('file');
      schedule.layouts.push({
        id: String(fileId), // Normalized string ID for consistent type usage
        file: fileId,
        fromdt: layoutEl.getAttribute('fromdt'),
        todt: layoutEl.getAttribute('todt'),
        scheduleid: layoutEl.getAttribute('scheduleid'),
        priority: parseInt(layoutEl.getAttribute('priority') || '0'),
        campaignId: null, // Standalone layout
        maxPlaysPerHour: parseInt(layoutEl.getAttribute('maxPlaysPerHour') || '0')
      });
    }

    // Parse overlay layouts (appear on top of main layouts)
    // Format: <overlays><overlay duration="60" file="123" fromdt="..." todt="..." priority="10" ... /></overlays>
    const overlaysContainer = doc.querySelector('overlays');
    if (overlaysContainer) {
      for (const overlayEl of overlaysContainer.querySelectorAll('overlay')) {
        const fileId = overlayEl.getAttribute('file');
        schedule.overlays.push({
          id: String(fileId), // Normalized string ID for consistent type usage
          duration: parseInt(overlayEl.getAttribute('duration') || '60'),
          file: fileId,
          fromDt: overlayEl.getAttribute('fromdt'),
          toDt: overlayEl.getAttribute('todt'),
          priority: parseInt(overlayEl.getAttribute('priority') || '0'),
          scheduleId: overlayEl.getAttribute('scheduleid'),
          isGeoAware: overlayEl.getAttribute('isGeoAware') === '1',
          geoLocation: overlayEl.getAttribute('geoLocation') || '',
          maxPlaysPerHour: parseInt(overlayEl.getAttribute('maxPlaysPerHour') || '0')
          // TODO: Parse criteria elements if present
        });
      }
    }

    // Parse action events (scheduled triggers)
    const actionsContainer = doc.querySelector('actions');
    if (actionsContainer) {
      for (const actionEl of actionsContainer.querySelectorAll('action')) {
        schedule.actions.push({
          actionType: actionEl.getAttribute('actionType') || '',
          triggerCode: actionEl.getAttribute('triggerCode') || '',
          layoutCode: actionEl.getAttribute('layoutCode') || '',
          commandCode: actionEl.getAttribute('commandCode') || '',
          duration: parseInt(actionEl.getAttribute('duration') || '0'),
          fromDt: actionEl.getAttribute('fromdt'),
          toDt: actionEl.getAttribute('todt'),
          priority: parseInt(actionEl.getAttribute('priority') || '0'),
          scheduleId: actionEl.getAttribute('scheduleid'),
          isGeoAware: actionEl.getAttribute('isGeoAware') === '1',
          geoLocation: actionEl.getAttribute('geoLocation') || ''
        });
      }
    }

    // Parse server commands (remote control)
    for (const cmdEl of doc.querySelectorAll('schedule > command')) {
      schedule.commands.push({
        code: cmdEl.getAttribute('command') || '',
        date: cmdEl.getAttribute('date') || ''
      });
    }

    // Parse data connectors (real-time data sources for widgets)
    for (const dcEl of doc.querySelectorAll('dataconnector')) {
      schedule.dataConnectors.push({
        id: dcEl.getAttribute('id') || '',
        dataConnectorId: dcEl.getAttribute('dataConnectorId') || '',
        dataKey: dcEl.getAttribute('dataKey') || '',
        url: dcEl.getAttribute('url') || '',
        updateInterval: parseInt(dcEl.getAttribute('updateInterval') || '300', 10)
      });
    }

    return schedule;
  }

  /**
   * NotifyStatus - report current status
   * @param {Object} status - Status object with currentLayoutId, deviceName, etc.
   */
  async notifyStatus(status) {
    // Enrich with storage estimate if available
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        status.availableSpace = estimate.quota - estimate.usage;
        status.totalSpace = estimate.quota;
      } catch (_) { /* storage estimate not supported */ }
    }

    // Add timezone if not already provided
    if (!status.timeZone && typeof Intl !== 'undefined') {
      status.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    if (this.useRest) {
      const result = await this.restSend('PUT', '/status', {
        statusData: status,
      });
      return result;
    }

    return await this.call('NotifyStatus', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      status: JSON.stringify(status)
    });
  }

  /**
   * MediaInventory - report downloaded files
   */
  async mediaInventory(inventoryXml) {
    if (this.useRest) {
      return this.restSend('POST', '/mediaInventory', {
        inventory: inventoryXml,
      });
    }

    return await this.call('MediaInventory', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      mediaInventory: inventoryXml
    });
  }

  /**
   * BlackList - report broken media to CMS
   * @param {string} mediaId - The media file ID
   * @param {string} type - File type ('media' or 'layout')
   * @param {string} reason - Reason for blacklisting
   * @returns {Promise<boolean>}
   */
  async blackList(mediaId, type, reason) {
    // BlackList has no REST equivalent — always use SOAP
    try {
      const xml = await this.call('BlackList', {
        serverKey: this.config.cmsKey,
        hardwareKey: this.config.hardwareKey,
        mediaId: String(mediaId),
        type: type || 'media',
        reason: reason || 'Failed to render'
      });
      log.info(`BlackListed ${type}/${mediaId}: ${reason}`);
      return xml === 'true';
    } catch (error) {
      log.warn('BlackList failed:', error);
      return false;
    }
  }

  /**
   * GetResource - get rendered widget HTML
   */
  async getResource(layoutId, regionId, mediaId) {
    if (this.useRest) {
      return this.restGet('/resource', {
        layoutId: String(layoutId),
        regionId: String(regionId),
        mediaId: String(mediaId),
      });
    }

    const xml = await this.call('GetResource', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      layoutId: String(layoutId),
      regionId: String(regionId),
      mediaId: String(mediaId)
    });

    // Response is just the HTML string
    return xml;
  }

  /**
   * SubmitLog - submit player logs to CMS for remote debugging
   * @param {string} logXml - XML string containing log entries
   * @returns {Promise<boolean>} - true if logs were successfully submitted
   */
  async submitLog(logXml) {
    if (this.useRest) {
      const result = await this.restSend('POST', '/log', {
        logXml,
      });
      return result?.success === true;
    }

    const xml = await this.call('SubmitLog', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      logXml: logXml
    });

    return xml === 'true';
  }

  /**
   * SubmitScreenShot - submit screenshot to CMS for display verification
   * @param {string} base64Image - Base64-encoded PNG image data
   * @returns {Promise<boolean>} - true if screenshot was successfully submitted
   */
  async submitScreenShot(base64Image) {
    if (this.useRest) {
      const result = await this.restSend('POST', '/screenshot', {
        screenshot: base64Image,
      });
      return result?.success === true;
    }

    const xml = await this.call('SubmitScreenShot', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey,
      screenShot: base64Image
    });

    return xml === 'true';
  }

  /**
   * SubmitStats - submit proof of play statistics
   * @param {string} statsXml - XML-encoded stats string (already SOAP-escaped: <records>&lt;stat.../&gt;</records>)
   * @returns {Promise<boolean>} - true if stats were successfully submitted
   */
  async submitStats(statsXml) {
    if (this.useRest) {
      try {
        const result = await this.restSend('POST', '/stats', {
          statXml: statsXml,
        });
        const success = result?.success === true;
        log.info(`SubmitStats result: ${success}`);
        return success;
      } catch (error) {
        log.error('SubmitStats failed:', error);
        throw error;
      }
    }

    try {
      const xml = await this.call('SubmitStats', {
        serverKey: this.config.cmsKey,
        hardwareKey: this.config.hardwareKey,
        statXml: statsXml
      });

      // Parse success response - CMS returns 'true' or 'false'
      const success = xml === 'true';
      log.info(`SubmitStats result: ${success}`);

      return success;
    } catch (error) {
      log.error('SubmitStats failed:', error);
      throw error;
    }
  }
}
