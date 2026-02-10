/**
 * XMDS SOAP client
 * Protocol: https://github.com/linuxnow/xibo_players_docs
 */

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
   * Call XMDS method
   */
  async call(method, params = {}) {
    const url = `${this.config.cmsAddress}/xmds.php?v=${this.schemaVersion}`;
    const body = this.buildEnvelope(method, params);

    console.log(`[XMDS] ${method}`, params);

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
      clientType: 'linux',  // CRITICAL: 'linux' bypasses commercial licensing (commercialLicence=3)
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
      campaigns: []
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
        campaign.layouts.push({
          file: layoutEl.getAttribute('file'),
          // Layouts in campaigns inherit timing from campaign level
          fromdt: layoutEl.getAttribute('fromdt') || campaign.fromdt,
          todt: layoutEl.getAttribute('todt') || campaign.todt,
          scheduleid: campaign.scheduleid,
          priority: campaign.priority, // Priority at campaign level
          campaignId: campaign.id
        });
      }

      schedule.campaigns.push(campaign);
    }

    // Parse standalone layouts (not in campaigns)
    for (const layoutEl of doc.querySelectorAll('schedule > layout')) {
      schedule.layouts.push({
        file: layoutEl.getAttribute('file'),
        fromdt: layoutEl.getAttribute('fromdt'),
        todt: layoutEl.getAttribute('todt'),
        scheduleid: layoutEl.getAttribute('scheduleid'),
        priority: parseInt(layoutEl.getAttribute('priority') || '0'),
        campaignId: null // Standalone layout
      });
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
}
