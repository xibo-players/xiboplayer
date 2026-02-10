/**
 * Main player orchestrator
 */

import { config } from '@xiboplayer/utils';
import { XmdsClient } from '@xiboplayer/xmds';
import { cacheManager } from '@xiboplayer/cache';
import { scheduleManager } from '@xiboplayer/schedule';
import { LayoutTranslator } from '@xiboplayer/renderer';
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
    this.currentLayoutIndex = 0; // Track position in campaign
    this.layoutChangeTimeout = null; // Timer for layout cycling
    this.layoutScripts = []; // Track scripts from current layout
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
          // Always re-translate to pick up code changes (layout files are small)
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
      this.currentLayoutIndex = 0;

      // Clear any existing layout change timer
      if (this.layoutChangeTimeout) {
        clearTimeout(this.layoutChangeTimeout);
      }

      // Show first layout and start cycling
      await this.showCurrentLayout();
    }
  }

  /**
   * Show the current layout in the campaign and schedule next layout
   */
  async showCurrentLayout() {
    if (this.currentLayouts.length === 0) {
      this.showMessage('No layout scheduled');
      return;
    }

    const layoutFile = this.currentLayouts[this.currentLayoutIndex];
    await this.showLayout(layoutFile);

    // If there are multiple layouts, schedule the next one
    if (this.currentLayouts.length > 1) {
      // Get layout duration (default to 60 seconds if not specified)
      const layoutDuration = await this.getLayoutDuration(layoutFile);
      const duration = layoutDuration || 60000; // milliseconds

      console.log(`[Player] Layout will change in ${duration}ms`);

      // Schedule next layout
      this.layoutChangeTimeout = setTimeout(() => {
        this.advanceToNextLayout();
      }, duration);
    }
  }

  /**
   * Advance to the next layout in the campaign
   */
  async advanceToNextLayout() {
    if (this.currentLayouts.length <= 1) {
      return; // Nothing to cycle to
    }

    // Advance index (loop back to 0 at end)
    this.currentLayoutIndex = (this.currentLayoutIndex + 1) % this.currentLayouts.length;
    console.log(`[Player] Advancing to layout ${this.currentLayoutIndex + 1}/${this.currentLayouts.length}`);

    // Show the next layout
    await this.showCurrentLayout();
  }

  /**
   * Get layout duration from cache or default to 60 seconds
   */
  async getLayoutDuration(layoutFile) {
    try {
      const layoutId = layoutFile.replace('.xlf', '').replace(/^.*\//, '');
      const xlfText = await cacheManager.getCachedFileText('layout', layoutId);

      if (!xlfText) {
        return 60000; // Default 60 seconds
      }

      // Parse XLF to get duration
      const parser = new DOMParser();
      const xlf = parser.parseFromString(xlfText, 'text/xml');
      const layoutNode = xlf.querySelector('layout');

      if (layoutNode) {
        const duration = parseInt(layoutNode.getAttribute('duration')) || 60;
        return duration * 1000; // Convert to milliseconds
      }

      return 60000; // Default
    } catch (error) {
      console.warn('[Player] Could not get layout duration:', error);
      return 60000; // Default
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

    // Remove previous layout's scripts to avoid variable redeclaration errors
    this.layoutScripts.forEach(script => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    });
    this.layoutScripts = [];

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
    // Wrap inline scripts in IIFE to prevent const redeclaration errors
    const allScripts = [...doc.querySelectorAll('head > script'), ...doc.querySelectorAll('body > script')];
    allScripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        // Wrap inline script in IIFE to create isolated scope
        // This prevents const/let redeclaration errors when switching layouts
        newScript.textContent = `(function() {\n${oldScript.textContent}\n})();`;
      }
      // Mark script with data attribute for tracking
      newScript.setAttribute('data-layout-script', layoutId);
      document.body.appendChild(newScript);
      this.layoutScripts.push(newScript); // Track for cleanup
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

/**
 * Network Activity Tracker
 */
class NetworkActivityTracker {
  constructor() {
    this.activities = [];
    this.maxActivities = 100;
  }

  addActivity(filename, status, size = null) {
    const activity = {
      timestamp: new Date(),
      filename,
      status,
      size
    };
    this.activities.unshift(activity);
    if (this.activities.length > this.maxActivities) {
      this.activities.pop();
    }
    this.updateUI();
  }

  updateUI() {
    const list = document.getElementById('activity-list');
    if (!list) return;

    if (this.activities.length === 0) {
      list.innerHTML = '<li class="empty">No network activity yet</li>';
      return;
    }

    list.innerHTML = this.activities.map(activity => {
      const time = activity.timestamp.toLocaleTimeString();
      const statusClass = activity.status === 'success' ? 'success' :
                          activity.status === 'error' ? 'error' : 'loading';
      const sizeText = activity.size ? this.formatSize(activity.size) : '-';

      return `
        <li>
          <span class="time">${time}</span>
          <span class="file" title="${activity.filename}">${activity.filename}</span>
          <span class="size">${sizeText}</span>
          <span class="status ${statusClass}">${activity.status}</span>
        </li>
      `;
    }).join('');
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}

const networkTracker = new NetworkActivityTracker();

/**
 * Setup download progress UI
 */
function setupProgressUI() {
  const progressEl = document.getElementById('download-progress');
  const filenameEl = document.getElementById('progress-filename');
  const fillEl = document.getElementById('progress-fill');
  const percentEl = document.getElementById('progress-percent');
  const sizeEl = document.getElementById('progress-size');

  window.addEventListener('download-progress', (event) => {
    const { filename, loaded, total, percent, complete, error } = event.detail;

    if (error) {
      // Show error
      networkTracker.addActivity(filename, 'error', total);
      fillEl.style.background = 'linear-gradient(90deg, #c62828, #e53935)';
      setTimeout(() => {
        progressEl.style.display = 'none';
        fillEl.style.background = 'linear-gradient(90deg, #4CAF50, #66BB6A)';
      }, 3000);
    } else if (complete) {
      // Show 100% briefly
      fillEl.style.width = '100%';
      percentEl.textContent = '100%';

      // Hide progress after 2 seconds
      setTimeout(() => {
        progressEl.style.display = 'none';
      }, 2000);
      networkTracker.addActivity(filename, 'success', total);
    } else {
      // Show progress
      progressEl.style.display = 'block';
      filenameEl.textContent = filename;
      fillEl.style.width = percent.toFixed(1) + '%';
      percentEl.textContent = percent.toFixed(1) + '%';

      const loadedMB = (loaded / 1024 / 1024).toFixed(1);
      const totalMB = (total / 1024 / 1024).toFixed(1);
      sizeEl.textContent = `${loadedMB} / ${totalMB} MB`;

      if (percent === 0) {
        networkTracker.addActivity(filename, 'loading', total);
      }
    }
  });
}

/**
 * Setup network activity panel (Ctrl+N)
 */
function setupNetworkPanel() {
  const panel = document.getElementById('network-panel');
  const closeBtn = document.getElementById('close-network');

  // Keyboard shortcut: Ctrl+N
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'n') {
      event.preventDefault();
      const isVisible = panel.style.display === 'block';
      panel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        networkTracker.updateUI(); // Refresh on open
      }
    }

    // Also allow ESC to close
    if (event.key === 'Escape' && panel.style.display === 'block') {
      panel.style.display = 'none';
    }
  });

  // Close button
  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });
}

// Auto-start player when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupProgressUI();
    setupNetworkPanel();
    const player = new Player();
    player.init();
  });
} else {
  setupProgressUI();
  setupNetworkPanel();
  const player = new Player();
  player.init();
}
