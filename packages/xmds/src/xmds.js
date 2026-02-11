/**
 * XMDS SOAP client
 * Protocol: https://github.com/linuxnow/xibo_players_docs
 */
import { createLogger, fetchWithRetry } from '@xiboplayer/utils';

const log = createLogger('XMDS');

export class XmdsClient {
  constructor(config) {
    this.config = config;
    this.schemaVersion = 5;
    this.retryOptions = config.retryOptions || { maxRetries: 2, baseDelayMs: 2000 };
  }

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
   * Call XMDS method
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

  /**
   * RegisterDisplay - authenticate and get settings
   */
  async registerDisplay() {
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
    const xml = await this.call('RequiredFiles', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey
    });

    return this.parseRequiredFilesResponse(xml);
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
    const xml = await this.call('Schedule', {
      serverKey: this.config.cmsKey,
      hardwareKey: this.config.hardwareKey
    });

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
    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        status.availableSpace = estimate.quota - estimate.usage;
        status.totalSpace = estimate.quota;
      } catch (_) { /* storage estimate not supported */ }
    }

    // Add timezone if not already provided
    if (!status.timeZone) {
      status.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
