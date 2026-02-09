/**
 * PWA-XLR Player with RendererLite
 *
 * Alternative main entry point that uses RendererLite instead of XLR.
 * This demonstrates how to use the lightweight renderer library.
 *
 * To switch between XLR and RendererLite:
 * - Update index.html to import main-lite.ts instead of main.ts
 * - Or use a build flag/environment variable
 */

// @ts-ignore - JavaScript module
import { RendererLite } from '@core/renderer-lite.js';

// Import core modules (will be loaded at runtime)
let cacheManager: any;
let scheduleManager: any;
let config: any;
let XmrWrapper: any;

class PwaLitePlayer {
  private renderer!: RendererLite;
  private xmds!: any;
  private collectionInterval?: number;
  private xmr: any = null;

  async init() {
    console.log('[PWA-Lite] Initializing player with RendererLite...');

    // Load core modules
    await this.loadCoreModules();

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const swPath = new URL('./sw.js', window.location.href).pathname;
        const registration = await navigator.serviceWorker.register(swPath);
        console.log('[PWA-Lite] Service Worker registered:', registration.scope);

        if (registration.installing) {
          await new Promise(resolve => {
            registration.installing!.addEventListener('statechange', (e) => {
              if ((e.target as ServiceWorker).state === 'activated') {
                resolve(undefined);
              }
            });
          });
        }
      } catch (error) {
        console.warn('[PWA-Lite] Service Worker registration failed:', error);
      }
    }

    // Initialize cache
    console.log('[PWA-Lite] Initializing cache...');
    await cacheManager.init();

    // Create renderer
    const container = document.getElementById('xlr-container');
    if (!container) {
      throw new Error('No #xlr-container found');
    }

    this.renderer = new RendererLite(
      {
        cmsUrl: config.cmsAddress,
        hardwareKey: config.hardwareKey
      },
      container,
      {
        // Provide media URL resolver
        getMediaUrl: async (filename: string) => {
          // Return cache URL - Service Worker will intercept and serve from cache
          return `${window.location.origin}/player/cache/media/${filename}`;
        },

        // Provide widget HTML resolver
        getWidgetHtml: async (widget: any) => {
          // Widget HTML is already in widget.raw from XLF parsing
          // If we need to fetch fresh from CMS, use xmds.getResource()
          return widget.raw;
        }
      }
    );

    // Setup event listeners
    this.setupRendererEvents();

    // Setup UI
    this.setupUI();

    // Start collection cycle
    await this.collect();

    console.log('[PWA-Lite] Player initialized successfully');
  }

  /**
   * Load core modules
   */
  private async loadCoreModules() {
    try {
      const cacheModule = await import('@core/cache.js');
      const xmdsModule = await import('@core/xmds.js');
      const scheduleModule = await import('@core/schedule.js');
      const configModule = await import('@core/config.js');
      // @ts-ignore
      const xmrModule = await import('@core/xmr-wrapper.js');

      cacheManager = cacheModule.cacheManager;
      scheduleManager = scheduleModule.scheduleManager;
      config = configModule.config;
      XmrWrapper = xmrModule.XmrWrapper;

      const XmdsClientClass = xmdsModule.XmdsClient;
      this.xmds = new XmdsClientClass(config);

      console.log('[PWA-Lite] Core modules loaded');
    } catch (error) {
      console.error('[PWA-Lite] Failed to load core modules:', error);
      throw error;
    }
  }

  /**
   * Setup renderer event listeners
   */
  private setupRendererEvents() {
    this.renderer.on('layoutStart', (layoutId: number) => {
      console.log('[PWA-Lite] Layout started:', layoutId);
      this.updateStatus(`Playing layout ${layoutId}`);
    });

    this.renderer.on('layoutEnd', (layoutId: number) => {
      console.log('[PWA-Lite] Layout ended:', layoutId);

      // Report to CMS
      this.xmds.notifyStatus({
        currentLayoutId: layoutId,
      }).catch((error: any) => {
        console.warn('[PWA-Lite] Failed to notify status:', error);
      });
    });

    this.renderer.on('widgetStart', (widget: any) => {
      console.log('[PWA-Lite] Widget started:', widget.type, widget.widgetId);
    });

    this.renderer.on('widgetEnd', (widget: any) => {
      console.log('[PWA-Lite] Widget ended:', widget.type, widget.widgetId);
    });

    this.renderer.on('error', (error: any) => {
      console.error('[PWA-Lite] Renderer error:', error);
      this.updateStatus(`Error: ${error.type}`, 'error');
    });
  }

  /**
   * Collection cycle
   */
  async collect() {
    console.log('[PWA-Lite] Starting collection cycle...');
    this.updateStatus('Collecting data from CMS...');

    try {
      // Register display
      const regResult = await this.xmds.registerDisplay();
      console.log('[PWA-Lite] Display registered:', regResult);

      // Initialize XMR if available
      const xmrUrl = regResult.settings?.xmrWebSocketAddress || regResult.settings?.xmrNetworkAddress;
      if (xmrUrl) {
        const xmrCmsKey = regResult.settings?.xmrCmsKey || regResult.settings?.serverKey || config.serverKey;

        if (!this.xmr) {
          console.log('[PWA-Lite] Initializing XMR WebSocket:', xmrUrl);
          this.xmr = new XmrWrapper(config, this);
          await this.xmr.start(xmrUrl, xmrCmsKey);
        } else if (!this.xmr.isConnected()) {
          console.log('[PWA-Lite] XMR disconnected, attempting to reconnect...');
          this.xmr.reconnectAttempts = 0;
          await this.xmr.start(xmrUrl, xmrCmsKey);
        }
      }

      // Get required files
      const files = await this.xmds.requiredFiles();
      console.log('[PWA-Lite] Required files:', files.length);

      // Download missing files
      for (const file of files) {
        await cacheManager.downloadFile(file);
      }

      // Get schedule
      const schedule = await this.xmds.schedule();
      console.log('[PWA-Lite] Schedule received');

      // Update schedule manager
      scheduleManager.setSchedule(schedule);

      // Get current layouts from schedule
      const layoutFiles = scheduleManager.getCurrentLayouts();
      console.log('[PWA-Lite] Current layouts:', layoutFiles);

      if (layoutFiles.length > 0) {
        // For now, play the first layout
        // TODO: Implement full schedule cycling
        const layoutFile = layoutFiles[0];
        const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);

        // Get XLF from cache
        const xlfBlob = await cacheManager.getCachedFile('layout', layoutId);
        if (xlfBlob) {
          const xlfXml = await xlfBlob.text();

          // Fetch widget HTML for all widgets in the layout
          await this.fetchWidgetHtml(xlfXml, layoutId);

          // Render layout
          await this.renderer.renderLayout(xlfXml, layoutId);
          this.updateStatus(`Playing layout ${layoutId}`);
        } else {
          console.warn('[PWA-Lite] Layout not in cache:', layoutId);
          this.updateStatus('Layout not available', 'error');
        }
      } else {
        console.log('[PWA-Lite] No layouts scheduled');
        this.updateStatus('No layouts scheduled');
      }

      // Setup collection interval on first run
      if (!this.collectionInterval) {
        const collectIntervalSeconds = parseInt(regResult.settings?.collectInterval || '300', 10);
        const collectIntervalMs = collectIntervalSeconds * 1000;

        console.log(`[PWA-Lite] Setting up collection interval: ${collectIntervalSeconds}s`);

        this.collectionInterval = window.setInterval(() => {
          console.log('[PWA-Lite] Running scheduled collection cycle...');
          this.collect().catch(error => {
            console.error('[PWA-Lite] Collection error:', error);
          });
        }, collectIntervalMs);
      }

    } catch (error) {
      console.error('[PWA-Lite] Collection error:', error);
      this.updateStatus(`Collection error: ${error}`, 'error');
    }
  }

  /**
   * Fetch widget HTML for all widgets in layout
   */
  private async fetchWidgetHtml(xlfXml: string, layoutId: number) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xlfXml, 'text/xml');

    // Find all widgets that need HTML
    const widgetTypes = ['clock', 'calendar', 'weather', 'currencies', 'stocks',
                        'twitter', 'global', 'embedded', 'text', 'ticker'];

    for (const regionEl of doc.querySelectorAll('region')) {
      const regionId = regionEl.getAttribute('id');

      for (const mediaEl of regionEl.querySelectorAll('media')) {
        const type = mediaEl.getAttribute('type');
        const widgetId = mediaEl.getAttribute('id');

        if (widgetTypes.some(w => type?.includes(w))) {
          try {
            console.log(`[PWA-Lite] Fetching widget HTML for ${type} (${widgetId})`);
            const html = await this.xmds.getResource(layoutId, regionId, widgetId);

            // Store widget HTML in cache
            await cacheManager.cacheWidgetHtml(layoutId, regionId, widgetId, html);

            // Update raw content in XLF (for RendererLite to use)
            const rawEl = mediaEl.querySelector('raw');
            if (rawEl) {
              rawEl.textContent = html;
            } else {
              const newRaw = doc.createElement('raw');
              newRaw.textContent = html;
              mediaEl.appendChild(newRaw);
            }

          } catch (error) {
            console.warn(`[PWA-Lite] Failed to fetch widget HTML:`, error);
          }
        }
      }
    }
  }

  /**
   * Setup UI
   */
  private setupUI() {
    const container = document.getElementById('xlr-container');
    if (!container) {
      console.warn('[PWA-Lite] No #xlr-container found');
    }

    this.updateConfigDisplay();
  }

  /**
   * Update config display
   */
  private updateConfigDisplay() {
    const configEl = document.getElementById('config-info');
    if (configEl) {
      configEl.textContent = `CMS: ${config.cmsAddress} | Display: ${config.displayName || config.hardwareKey} | Mode: Lite`;
    }
  }

  /**
   * Update status message
   */
  private updateStatus(message: string, type: 'info' | 'error' = 'info') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status status-${type}`;
    }
    console.log(`[PWA-Lite] Status: ${message}`);
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    this.renderer.cleanup();

    if (this.xmr) {
      this.xmr.stop();
    }
  }
}

// Initialize player
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const player = new PwaLitePlayer();
    player.init().catch(error => {
      console.error('[PWA-Lite] Failed to initialize:', error);
    });

    window.addEventListener('beforeunload', () => {
      player.cleanup();
    });
  });
} else {
  const player = new PwaLitePlayer();
  player.init().catch(error => {
    console.error('[PWA-Lite] Failed to initialize:', error);
  });

  window.addEventListener('beforeunload', () => {
    player.cleanup();
  });
}
