/**
 * Main player orchestrator
 */

import { config } from './config.js';
import { XmdsClient } from './xmds.js';
import { cacheManager } from './cache.js';
import { scheduleManager } from './schedule.js';
import { LayoutTranslator } from './layout.js';
import { XmrWrapper } from './xmr-wrapper.js';

class Player {
  constructor() {
    this.xmds = new XmdsClient(config);
    this.layoutTranslator = new LayoutTranslator(this.xmds);
    this.xmr = null; // XMR real-time messaging
    this.settings = null;
    this.collectInterval = 900000; // 15 minutes default
    this.scheduleCheckInterval = 60000; // 1 minute
    this.lastScheduleCheck = 0;
    this.currentLayouts = [];
  }

  /**
   * Initialize player
   */
  async init() {
    console.log('[Player] Initializing...');

    // Check configuration
    if (!config.isConfigured()) {
      console.log('[Player] Not configured, redirecting to setup');
      window.location.href = '/player/setup.html';
      return;
    }

    // Initialize cache
    await cacheManager.init();
    console.log('[Player] Cache initialized');

    // Start collection cycle
    await this.collect();
    setInterval(() => this.collect(), this.collectInterval);

    // Start schedule check cycle
    setInterval(() => this.checkSchedule(), this.scheduleCheckInterval);
  }

  /**
   * Collection cycle - sync with CMS
   */
  async collect() {
    try {
      console.log('[Player] Starting collection cycle');

      // 1. Register display
      const regResult = await this.xmds.registerDisplay();
      console.log('[Player] RegisterDisplay:', regResult.code, regResult.message);

      if (regResult.code !== 'READY') {
        this.showMessage(`Display not authorized: ${regResult.message}`);
        return;
      }

      // Save settings
      if (regResult.settings) {
        this.settings = regResult.settings;
        if (this.settings.collectInterval) {
          this.collectInterval = parseInt(this.settings.collectInterval) * 1000;
        }
        console.log('[Player] Settings updated:', this.settings);

        // Initialize XMR if available and not already connected
        if (!this.xmr && this.settings.xmrNetAddress) {
          await this.initializeXmr();
        }
      }

      // 2. Get required files
      const files = await this.xmds.requiredFiles();
      console.log('[Player] Required files:', files.length);

      // 3. Download missing files
      for (const file of files) {
        try {
          if (file.download === 'http' && file.path) {
            await cacheManager.downloadFile(file);
          } else if (file.download === 'xmds') {
            // TODO: Implement XMDS GetFile for chunked downloads
            console.warn('[Player] XMDS download not yet implemented for', file.id);
          }

          // Translate layouts to HTML
          if (file.type === 'layout') {
            await this.translateLayout(file);
          }
        } catch (error) {
          console.error(`[Player] Failed to download ${file.type}/${file.id}:`, error);
        }
      }

      // 4. Get schedule
      const schedule = await this.xmds.schedule();
      console.log('[Player] Schedule:', schedule);
      scheduleManager.setSchedule(schedule);

      // 5. Apply schedule
      await this.checkSchedule();

      // 6. Notify status
      await this.xmds.notifyStatus({
        currentLayoutId: this.currentLayouts[0] || null,
        deviceName: config.displayName,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      console.log('[Player] Collection cycle complete');
    } catch (error) {
      console.error('[Player] Collection failed:', error);
      this.showMessage(`Collection failed: ${error.message}`);
    }
  }

  /**
   * Translate layout XLF to HTML
   */
  async translateLayout(fileInfo) {
    const xlfText = await cacheManager.getCachedFileText('layout', fileInfo.id);
    if (!xlfText) {
      console.warn('[Player] Layout XLF not found in cache:', fileInfo.id);
      return;
    }

    try {
      const html = await this.layoutTranslator.translateXLF(fileInfo.id, xlfText, cacheManager);

      // Cache the translated HTML
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const cacheKey = `/cache/layout-html/${fileInfo.id}`;
      const cache = await caches.open('xibo-media-v1');
      await cache.put(cacheKey, new Response(htmlBlob));

      console.log('[Player] Translated layout:', fileInfo.id);
    } catch (error) {
      console.error('[Player] Failed to translate layout:', fileInfo.id, error);
    }
  }

  /**
   * Check schedule and update display
   */
  async checkSchedule() {
    if (!scheduleManager.shouldCheckSchedule(this.lastScheduleCheck)) {
      return;
    }

    this.lastScheduleCheck = Date.now();
    const layouts = scheduleManager.getCurrentLayouts();

    if (JSON.stringify(layouts) !== JSON.stringify(this.currentLayouts)) {
      console.log('[Player] Schedule changed:', layouts);
      this.currentLayouts = layouts;
      await this.showLayout(layouts[0]);
    }
  }

  /**
   * Show a layout by loading HTML directly into page (not iframe)
   */
  async showLayout(layoutFile) {
    if (!layoutFile) {
      this.showMessage('No layout scheduled');
      return;
    }

    // Extract layout ID from filename (e.g., "123.xlf" -> "123" or just "1")
    const layoutId = layoutFile.replace('.xlf', '').replace(/^.*\//, '');

    // Get the translated HTML from cache
    const html = await cacheManager.cache.match(`/cache/layout-html/${layoutId}`);
    if (!html) {
      console.warn('[Player] Layout HTML not in cache:', layoutId);
      this.showMessage(`Layout ${layoutId} not available`);
      return;
    }

    const htmlText = await html.text();

    console.log('[Player] Showing layout:', layoutId);

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Get the container
    const container = document.getElementById('layout-container');
    if (!container) return;

    // Extract all content except scripts
    const bodyWithoutScripts = doc.body.cloneNode(true);
    const scriptsInBody = bodyWithoutScripts.querySelectorAll('script');
    scriptsInBody.forEach(s => s.remove());

    // Set HTML (styles + body content without scripts)
    container.innerHTML = '';

    // Add head styles
    doc.querySelectorAll('head > style').forEach(style => {
      container.appendChild(style.cloneNode(true));
    });

    // Add body content
    while (bodyWithoutScripts.firstChild) {
      container.appendChild(bodyWithoutScripts.firstChild);
    }

    // Execute scripts manually (innerHTML doesn't execute them)
    const allScripts = [...doc.querySelectorAll('head > script'), ...doc.querySelectorAll('body > script')];
    allScripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      document.body.appendChild(newScript); // Append to body, not container
    });
  }

  /**
   * Initialize XMR real-time messaging
   */
  async initializeXmr() {
    try {
      // Construct XMR WebSocket URL
      let xmrUrl = this.settings.xmrNetAddress;

      // If xmrNetAddress is not a full WebSocket URL, construct it from CMS address
      if (!xmrUrl || (!xmrUrl.startsWith('ws://') && !xmrUrl.startsWith('wss://'))) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const cmsBase = config.cmsAddress || window.location.origin;
        const cmsHost = cmsBase.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        xmrUrl = `${protocol}//${cmsHost}/xmr`;
      }

      console.log('[Player] Initializing XMR with URL:', xmrUrl);

      // Create and start XMR wrapper
      this.xmr = new XmrWrapper(config, this);
      const success = await this.xmr.start(xmrUrl, config.cmsKey);

      if (success) {
        console.log('[Player] XMR real-time messaging enabled');
      } else {
        console.log('[Player] Continuing without XMR (polling mode only)');
      }
    } catch (error) {
      console.warn('[Player] XMR initialization failed:', error);
      console.log('[Player] Continuing in polling mode (XMDS only)');
    }
  }

  /**
   * Update player status (called by XMR wrapper)
   */
  updateStatus(status) {
    console.log('[Player] Status:', status);
    // Could update UI status indicator here
    const statusEl = document.getElementById('xmr-status');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = status.includes('connected') ? 'status-connected' : 'status-disconnected';
    }
  }

  /**
   * Capture screenshot (called by XMR when CMS requests it)
   */
  async captureScreenshot() {
    try {
      console.log('[Player] Capturing screenshot...');

      // Use html2canvas or native screenshot API if available
      // For now, just log that we received the command
      console.log('[Player] Screenshot capture not yet implemented');

      // TODO: Implement screenshot capture
      // 1. Use html2canvas to capture current layout
      // 2. Convert to blob
      // 3. Upload to CMS via SubmitScreenShot XMDS call

      return true;
    } catch (error) {
      console.error('[Player] Screenshot capture failed:', error);
      return false;
    }
  }

  /**
   * Change layout immediately (called by XMR)
   */
  async changeLayout(layoutId) {
    console.log('[Player] Changing to layout:', layoutId);
    try {
      // Find layout file by ID
      const layoutFile = `${layoutId}.xlf`;
      await this.showLayout(layoutFile);
      return true;
    } catch (error) {
      console.error('[Player] Change layout failed:', error);
      return false;
    }
  }

  /**
   * Show a message to the user
   */
  showMessage(message) {
    console.log('[Player]', message);
    const messageEl = document.getElementById('message');
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.style.display = 'block';
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 5000);
    }
  }
}

// Auto-start player when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const player = new Player();
    player.init();
  });
} else {
  const player = new Player();
  player.init();
}
