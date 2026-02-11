/**
 * XMDS SOAP client
 * Protocol: https://github.com/linuxnow/xibo_players_docs
 */
import { createLogger } from '@xiboplayer/utils';

const log = createLogger('XMDS');

export class XmdsClient {
  constructor(config) {
    this.config = config;
    this.schemaVersion = 5;
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8'
      },
      body
    });

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

    // Check for SOAP fault
    const fault = doc.querySelector('Fault');
    if (fault) {
      const faultString = fault.querySelector('faultstring')?.textContent || 'Unknown SOAP fault';
      throw new Error(`SOAP Fault: ${faultString}`);
    }

    // Extract response element
    const responseTag = `${method}Response`;
    const responseEl = doc.querySelector(responseTag) || doc.querySelector(`*|${responseTag}`);

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

    return { code, message, settings };
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
      overlays: []
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

    return schedule;
  }

  /**
   * NotifyStatus - report current status
   */
  async notifyStatus(status) {
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
