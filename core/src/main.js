/**
 * Main player orchestrator
 */

import { config } from './config.js';
import { XmdsClient } from './xmds.js';
import { cacheManager } from './cache.js';
import { scheduleManager } from './schedule.js';
import { layoutTranslator } from './layout.js';

class Player {
  constructor() {
    this.xmds = new XmdsClient(config);
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
      const html = await layoutTranslator.translateXLF(xlfText, cacheManager);

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
   * Show a layout in the iframe
   */
  async showLayout(layoutFile) {
    if (!layoutFile) {
      this.showMessage('No layout scheduled');
      return;
    }

    // Extract layout ID from filename (e.g., "123.xlf" -> "123")
    const layoutId = layoutFile.replace('.xlf', '');
    const layoutUrl = `/cache/layout-html/${layoutId}`;

    console.log('[Player] Showing layout:', layoutUrl);

    const iframe = document.getElementById('layout-iframe');
    if (iframe) {
      iframe.src = layoutUrl;
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
