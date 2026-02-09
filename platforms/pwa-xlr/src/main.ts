/**
 * PWA-XLR Player Main Entry Point
 *
 * Integrates Xibo Layout Renderer (XLR) with PWA infrastructure:
 * - Uses existing cache.js, xmds.js, schedule.js from @core
 * - Adapts Cache API storage to XLR's file access expectations
 * - Provides production-tested layout rendering, transitions, and media handling
 */

import XiboLayoutRenderer, { ConsumerPlatform, type OptionsType } from '@xibosignage/xibo-layout-renderer';
import type { IXlr } from './types';
import { XlrFileAdapter } from './xlr-adapter';
import { ScheduleBridge } from './schedule-bridge';
import { PwaLayout } from './pwa-layout';
import { WidgetParsingDetector } from './widget-parsing-detector';

// Import core modules (will be loaded at runtime)
// These are JavaScript modules from packages/core
let cacheManager: any;
let scheduleManager: any;
let config: any;
let XmrWrapper: any;

class PwaXlrPlayer {
  private xlr!: IXlr;
  private xmds!: any;  // XmdsClient instance
  private fileAdapter!: XlrFileAdapter;
  private scheduleBridge!: ScheduleBridge;
  private currentXlrLayouts: PwaLayout[] = [];
  private collectionInterval?: number;
  private xlrInitialized: boolean = false;
  private widgetParsingDetector!: WidgetParsingDetector;
  private xmr: any = null;  // XMR (WebSocket) instance for instant updates

  async init() {
    console.log('[PWA-XLR] Initializing player...');

    // Initialize widget parsing detector to prevent ActionController errors
    this.widgetParsingDetector = new WidgetParsingDetector();

    // Load core modules dynamically
    await this.loadCoreModules();

    // Register Service Worker for offline support and media intercept
    // Service Worker now properly handles HTTP 202 responses (doesn't cache them)
    if ('serviceWorker' in navigator) {
      try {
        // Use sw-v2.js to force browser to load new Service Worker
        const swPath = new URL('./sw-v2.js', window.location.href).pathname;
        const registration = await navigator.serviceWorker.register(swPath);
        console.log('[PWA-XLR] Service Worker registered for offline mode:', registration.scope);

        // Wait for SW to be active
        if (registration.installing) {
          await new Promise(resolve => {
            registration.installing!.addEventListener('statechange', (e) => {
              if ((e.target as ServiceWorker).state === 'activated') {
                resolve(undefined);
              }
            });
          });
        }

        // Request persistent storage (kiosk requirement)
        if (navigator.storage && navigator.storage.persist) {
          const persistent = await navigator.storage.persist();
          if (persistent) {
            console.log('[PWA-XLR] Persistent storage granted - cache won\'t be evicted');
          } else {
            console.warn('[PWA-XLR] Persistent storage denied - cache may be evicted');
          }
        }
      } catch (error) {
        console.warn('[PWA-XLR] Service Worker registration failed:', error);
      }
    }

    // Initialize cache manager
    console.log('[PWA-XLR] Initializing cache...');
    await cacheManager.init();

    // Initialize adapters
    this.fileAdapter = new XlrFileAdapter(cacheManager);
    this.scheduleBridge = new ScheduleBridge(scheduleManager, this.fileAdapter);

    // Don't setup XLR yet - will create it when we have layouts

    // Setup UI
    this.setupUI();

    // Start collection cycle (this will create and init XLR when we have layouts)
    await this.collect();

    // Collection interval will be set up after first collection based on CMS settings
    // XMR provides instant updates, so we only need to poll for backup/sync

    console.log('[PWA-XLR] Player initialized successfully');
  }

  /**
   * Load core modules from packages/core
   */
  private async loadCoreModules() {
    try {
      // Import as ES modules
      const cacheModule = await import('@core/cache.js');
      const xmdsModule = await import('@core/xmds.js');
      const scheduleModule = await import('@core/schedule.js');
      const configModule = await import('@core/config.js');
      // @ts-ignore - JavaScript module without types
      const xmrModule = await import('@core/xmr-wrapper.js');

      // Get instances/singletons
      cacheManager = cacheModule.cacheManager;
      scheduleManager = scheduleModule.scheduleManager;
      config = configModule.config;
      XmrWrapper = xmrModule.XmrWrapper;

      // Create XMDS client instance
      const XmdsClientClass = xmdsModule.XmdsClient;
      this.xmds = new XmdsClientClass(config);

      console.log('[PWA-XLR] Core modules loaded');
    } catch (error) {
      console.error('[PWA-XLR] Failed to load core modules:', error);
      throw error;
    }
  }


  /**
   * Create and initialize XLR with actual layouts (first run only)
   */
  private async recreateXlrWithLayouts(xlrLayouts: PwaLayout[]) {
    if (this.xlrInitialized) {
      console.log('[PWA-XLR] XLR already initialized');
      return;
    }

    try {
      const baseUrl = window.location.origin;

      const xlrOptions: OptionsType = {
        // File URLs - using empty/minimal paths since layouts have full blob URLs in their path field
        // This matches Electron's pattern where layouts have complete file:// URLs
        xlfUrl: '', // Layouts have full blob URLs in their path field
        getResourceUrl: `${baseUrl}/player/xlr/`, // Point to valid location
        layoutBackgroundDownloadUrl: '',
        layoutPreviewUrl: '',
        libraryDownloadUrl: '', // Empty so blob:// URLs are used as-is
        loaderUrl: `${baseUrl}/player/xlr/`,

        // Configuration
        idCounter: 0,
        inPreview: false,
        appHost: `${baseUrl}/player/xlr/`, // Fix 404 - point to actual deployed location
        platform: ConsumerPlatform.CHROMEOS,  // Use CHROMEOS for PWA-style /pwa/getResource URLs

        // CMS configuration
        config: {
          cmsUrl: config.cmsAddress,
          schemaVersion: 7,  // PWA endpoints require v7+
          cmsKey: config.cmsKey,
          hardwareKey: config.hardwareKey,
        },
      };

      // Follow Electron's pattern: Init with a simple splash layout first
      console.log('[PWA-XLR] Creating splash layout');
      const splash = new PwaLayout(0, '<layout width="1920" height="1080"><region/></layout>', 0);
      splash.path = '0.xlf';

      console.log('[PWA-XLR] Creating XLR instance with splash (like Electron)');
      this.xlr = XiboLayoutRenderer([splash], [], xlrOptions) as unknown as IXlr;

      // Setup event listeners
      this.setupXlrEvents();

      // Initialize XLR first (with splash layout)
      console.log('[PWA-XLR] Calling XLR.init()...');
      const initResponse = await this.xlr.init();
      console.log('[PWA-XLR] XLR.init() returned:', initResponse);

      // Start playing (like Electron does)
      console.log('[PWA-XLR] Calling playSchedules()...');
      (this.xlr as any).playSchedules(initResponse);
      this.xlrInitialized = true;

      // Attach widget parsing detector to XLR instance for internal state monitoring
      this.widgetParsingDetector.attachToXlr(this.xlr);
      console.log('[PWA-XLR] Widget parsing detector attached to XLR');

      console.log('[PWA-XLR] XLR initialized and playing. Now updating with', xlrLayouts.length, 'real layouts');

      // Now update with actual layouts (like Electron's onUpdateUniqueLayouts)
      if (xlrLayouts.length > 0) {
        console.log('[PWA-XLR] First layout:', {
          layoutId: xlrLayouts[0]?.layoutId,
          path: xlrLayouts[0]?.path,
          hasResponse: !!xlrLayouts[0]?.response
        });

        // Use updateScheduleLayouts like Electron does
        await this.xlr.updateScheduleLayouts(xlrLayouts as any);
        console.log('[PWA-XLR] Layouts updated successfully!');

        // Wait for XLR to finish parsing widget actions BEFORE triggering rendering
        // This prevents ActionController from seeing undefined actions during async parsing
        console.log('[PWA-XLR] Waiting for widget action parsing to complete...');
        await this.widgetParsingDetector.waitForParsingComplete(300);
        console.log('[PWA-XLR] Widget parsing complete, safe to render');

        // Emit updateLoop event to trigger XLR to play the new layouts (like Electron does)
        console.log('[PWA-XLR] Emitting updateLoop event to start playback...');
        this.xlr.emitter.emit('updateLoop', xlrLayouts);
        console.log('[PWA-XLR] updateLoop emitted!');

        // Fix image widget URLs after XLR renders
        // (layoutChange event doesn't fire for single-layout loops)
        setTimeout(() => this.fixImageWidgetUrls(), 1000);
      }

      console.log('[PWA-XLR] XLR fully ready!');

      // Expose XLR globally for debugging (like Electron does)
      (window as any).xlr = this.xlr;
      console.log('[PWA-XLR] XLR exposed as window.xlr');
    } catch (error) {
      console.error('[PWA-XLR] XLR creation failed:', error);
      throw error;
    }
  }

  /**
   * Fix native image widget URLs to use cached blob URLs
   * XLR generates /xmds.php?file=X.png which 404s
   * We replace with blob URLs from cache
   */
  private async fixImageWidgetUrls() {
    try {
      // Find all image widgets with data-media-type="image"
      const imageWidgets = document.querySelectorAll('[data-media-type="image"][data-render="native"]');

      for (const widget of imageWidgets) {
        const fileId = widget.getAttribute('data-file-id');
        if (!fileId) continue;

        // Get blob URL for this media file
        const blobUrl = await this.fileAdapter.provideMediaFile(parseInt(fileId));
        if (!blobUrl) {
          console.warn(`[PWA-XLR] No cached file for media ID: ${fileId}`);
          continue;
        }

        // Set as background-image
        (widget as HTMLElement).style.backgroundImage = `url(${blobUrl})`;
        console.log(`[PWA-XLR] Fixed image widget media/${fileId} with blob URL`);
      }
    } catch (error) {
      console.error('[PWA-XLR] Error fixing image URLs:', error);
    }
  }

  /**
   * Setup XLR event listeners
   */
  private setupXlrEvents() {
    // Layout change event
    this.xlr.on('layoutChange', async (layoutId: number) => {
      console.log('[PWA-XLR] Layout changed:', layoutId);
      this.updateStatus(`Playing layout ${layoutId}`);

      // Fix native image widgets to use cached blob URLs
      await this.fixImageWidgetUrls();
    });

    // Layout end event
    this.xlr.on('layoutEnd', async (layout: any) => {
      console.log('[PWA-XLR] Layout ended:', layout.layoutId);

      // Report to CMS via XMDS
      try {
        await this.xmds.notifyStatus({
          currentLayoutId: this.xlr.currentLayoutId || layout.layoutId,
        });
      } catch (error) {
        console.warn('[PWA-XLR] Failed to notify status:', error);
      }
    });

    // Layout error event
    this.xlr.on('layoutError', (error: any) => {
      console.error('[PWA-XLR] Layout error:', error);
      this.updateStatus(`Layout error: ${error.message}`, 'error');
    });

    // Media error event
    this.xlr.on('mediaError', (error: any) => {
      console.error('[PWA-XLR] Media error:', error);
    });
  }

  /**
   * Pre-fetch common widget dependencies (bundle.min.js, fonts.css)
   * These are shared across all text/global widgets
   */
  private async prefetchWidgetDependencies() {
    const dependencies = [
      { type: 'P', itemId: '1', fileType: 'bundle', filename: 'bundle.min.js' },
      { type: 'P', itemId: '1', fileType: 'fontCss', filename: 'fonts.css' }
    ];

    const fetchPromises = dependencies.map(async (dep) => {
      const cacheKey = `/cache/widget-dep/${dep.filename}`;
      const cache = await caches.open('xibo-media-v1');
      const cached = await cache.match(cacheKey);

      if (cached) {
        console.log(`[PWA-XLR] Widget dependency ${dep.filename} already cached`);
        return;
      }

      try {
        // Construct XMDS URL for widget dependencies
        const url = `${cacheManager.rewriteUrl(this.xmds.config.cmsAddress)}/xmds.php?file=${dep.filename}&displayId=${this.xmds.displayId || 1}&type=${dep.type}&itemId=${dep.itemId}&fileType=${dep.fileType}`;

        console.log(`[PWA-XLR] Pre-fetching widget dependency: ${dep.filename}`);
        const response = await fetch(url);

        if (response.ok) {
          // Cache for future use
          await cache.put(cacheKey, response.clone());
          console.log(`[PWA-XLR] ✓ Cached widget dependency: ${dep.filename} (${response.headers.get('Content-Length')} bytes)`);
        }
      } catch (error) {
        console.warn(`[PWA-XLR] Failed to pre-fetch ${dep.filename}:`, error);
      }
    });

    await Promise.all(fetchPromises);
  }

  /**
   * Collection cycle: register, download files, update schedule
   */
  async collect() {
    console.log('[PWA-XLR] Starting collection cycle...');
    this.updateStatus('Collecting data from CMS...');

    try {
      // Register display
      const regResult = await this.xmds.registerDisplay();
      console.log('[PWA-XLR] Display registered:', regResult);
      console.log('[PWA-XLR] Settings:', regResult.settings);
      // Use WebSocket address for browsers, fall back to network address
      const xmrUrl = regResult.settings?.xmrWebSocketAddress || regResult.settings?.xmrNetworkAddress;
      console.log('[PWA-XLR] XMR URL from settings:', xmrUrl);

      // Initialize or reconnect XMR (WebSocket) for instant updates if CMS provides URL
      if (xmrUrl) {
        // Get XMR-specific CMS key from settings (not the API key!)
        const xmrCmsKey = regResult.settings?.xmrCmsKey || regResult.settings?.serverKey || config.serverKey;
        console.log('[PWA-XLR] XMR CMS Key:', xmrCmsKey ? 'present' : 'missing');

        if (!this.xmr) {
          // First time initialization
          console.log('[PWA-XLR] Initializing XMR WebSocket:', xmrUrl);
          this.xmr = new XmrWrapper(config, this);
          await this.xmr.start(xmrUrl, xmrCmsKey);
        } else if (!this.xmr.isConnected()) {
          // XMR exists but is disconnected - try to reconnect
          console.log('[PWA-XLR] XMR disconnected, attempting to reconnect...');
          // Reset reconnect attempts to allow retry from collection cycle
          this.xmr.reconnectAttempts = 0;
          await this.xmr.start(xmrUrl, xmrCmsKey);
        } else {
          console.log('[PWA-XLR] XMR already connected');
        }
      } else {
        console.log('[PWA-XLR] XMR not configured - no URL provided by CMS');
      }

      // Get required files
      const files = await this.xmds.requiredFiles();
      console.log('[PWA-XLR] Required files:', files.length);

      // Download missing files
      for (const file of files) {
        await cacheManager.downloadFile(file);
      }

      // Get schedule
      const schedule = await this.xmds.schedule();
      console.log('[PWA-XLR] Schedule received');

      // Update schedule manager
      scheduleManager.setSchedule(schedule);

      // Check which layouts might have changed by comparing schedule files
      // This is a preliminary check before creating blob URLs
      const scheduledLayoutIds = scheduleManager.getCurrentLayouts()
        .map((file: string) => parseInt(file.replace('.xlf', ''), 10))
        .filter((id: number) => !isNaN(id));

      // Force refresh blob URLs for any layouts that are new or might have changed
      // This ensures we always get fresh XLF content from cache (which was just updated)
      const isFirstRun = this.currentXlrLayouts.length === 0;
      if (!isFirstRun) {
        // On subsequent runs, clean up blob URLs for layouts that are in the new schedule
        // This forces them to be recreated from the (potentially updated) cache
        for (const layoutId of scheduledLayoutIds) {
          this.fileAdapter.cleanupLayout(layoutId);
          console.log(`[XLR-Adapter] Invalidated cached blob URL for layout ${layoutId}`);
        }
      }

      // Convert to XLR format (will create fresh blob URLs from cache)
      const xlrLayouts = await this.scheduleBridge.convertToXlrFormat();

      // Replace media file paths with blob URLs (Electron pattern)
      // This bypasses Service Worker entirely - XLR loads videos directly from blob URLs
      for (const layout of xlrLayouts) {
        if (layout.replaceMediaWithBlobs) {
          await layout.replaceMediaWithBlobs(this.fileAdapter);
        }
      }

      // Pre-fetch common widget dependencies (bundle.min.js, fonts.css)
      await this.prefetchWidgetDependencies();

      // Update XLR if layouts changed
      const changedLayouts = this.getChangedLayouts(xlrLayouts);
      if (changedLayouts.length > 0 || this.shouldUpdateXlr(xlrLayouts)) {
        if (changedLayouts.length > 0) {
          console.log('[PWA-XLR] Detected layout changes:', changedLayouts.map(l =>
            `${l.layoutId} (${l.reason})`).join(', '));
        }
        console.log('[PWA-XLR] Updating XLR with new layouts:', xlrLayouts.length);

        // Clean up any remaining old blob URLs
        this.cleanupOldBlobUrls(this.currentXlrLayouts, xlrLayouts);

        this.currentXlrLayouts = xlrLayouts;

        // On first run, recreate XLR with actual layouts
        if (isFirstRun && xlrLayouts.length > 0) {
          console.log('[PWA-XLR] First run - recreating XLR with layouts...');
          await this.recreateXlrWithLayouts(xlrLayouts);
        } else {
          // Subsequent runs - use updateScheduleLayouts for proper update
          console.log('[PWA-XLR] Updating schedule with changed layouts...');
          await this.xlr.updateScheduleLayouts(xlrLayouts);

          // Wait for XLR to finish parsing widget actions BEFORE triggering rendering
          // This prevents ActionController from seeing undefined actions during async parsing
          console.log('[PWA-XLR] Waiting for widget action parsing to complete...');
          await this.widgetParsingDetector.waitForParsingComplete(300);
          console.log('[PWA-XLR] Widget parsing complete, safe to render');

          // Now emit updateLoop - ActionController will see valid actions
          this.xlr.emitter.emit('updateLoop', xlrLayouts);
        }

        this.updateStatus(`${xlrLayouts.length} layouts ready`);
      } else {
        console.log('[PWA-XLR] No schedule changes detected');
        this.updateStatus('Schedule up to date');
      }

      // Setup collection interval on first successful collection
      // Use CMS's collectInterval setting (default 5 minutes if not provided)
      if (!this.collectionInterval) {
        const collectIntervalSeconds = parseInt(regResult.settings?.collectInterval || '300', 10);
        const collectIntervalMs = collectIntervalSeconds * 1000;

        console.log(`[PWA-XLR] Setting up collection interval: ${collectIntervalSeconds}s`);

        this.collectionInterval = window.setInterval(() => {
          console.log('[PWA-XLR] Running scheduled collection cycle...');
          this.collect().catch(error => {
            console.error('[PWA-XLR] Collection error:', error);
          });
        }, collectIntervalMs);
      }
    } catch (error) {
      console.error('[PWA-XLR] Collection error:', error);
      this.updateStatus(`Collection error: ${error}`, 'error');
    }
  }

  /**
   * Check if XLR should be updated with new layouts
   */
  private shouldUpdateXlr(newLayouts: PwaLayout[]): boolean {
    // Always update on first run
    if (this.currentXlrLayouts.length === 0) {
      return true;
    }

    // Check if layout count changed
    if (newLayouts.length !== this.currentXlrLayouts.length) {
      return true;
    }

    // Check if layout IDs or content changed
    for (let i = 0; i < newLayouts.length; i++) {
      const newLayout = newLayouts[i];
      const currentLayout = this.currentXlrLayouts[i];

      // Layout ID changed (different layout in schedule)
      if (newLayout.layoutId !== currentLayout.layoutId) {
        return true;
      }

      // Layout content changed (blob URL changes when XLF content updates)
      if (newLayout.path !== currentLayout.path) {
        console.log(`[PWA-XLR] Layout ${newLayout.layoutId} content changed (blob URL updated)`);
        return true;
      }

      // Duration changed (layout modified)
      if (newLayout.duration !== currentLayout.duration) {
        console.log(`[PWA-XLR] Layout ${newLayout.layoutId} duration changed: ${currentLayout.duration}s → ${newLayout.duration}s`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get list of layouts that have changed with reasons
   */
  private getChangedLayouts(newLayouts: PwaLayout[]): Array<{layoutId: number, reason: string}> {
    const changes: Array<{layoutId: number, reason: string}> = [];

    if (this.currentXlrLayouts.length === 0) {
      return changes; // First run, not a "change"
    }

    // Check for added/removed layouts
    if (newLayouts.length !== this.currentXlrLayouts.length) {
      changes.push({
        layoutId: -1,
        reason: `count changed: ${this.currentXlrLayouts.length} → ${newLayouts.length}`
      });
      return changes;
    }

    // Check each layout for changes
    for (let i = 0; i < newLayouts.length; i++) {
      const newLayout = newLayouts[i];
      const currentLayout = this.currentXlrLayouts[i];

      if (newLayout.layoutId !== currentLayout.layoutId) {
        changes.push({layoutId: newLayout.layoutId, reason: 'layout replaced'});
      } else if (newLayout.path !== currentLayout.path) {
        changes.push({layoutId: newLayout.layoutId, reason: 'content updated'});
      } else if (newLayout.duration !== currentLayout.duration) {
        changes.push({layoutId: newLayout.layoutId, reason: `duration: ${currentLayout.duration}s → ${newLayout.duration}s`});
      }
    }

    return changes;
  }

  /**
   * Clean up old blob URLs that are no longer needed
   */
  private cleanupOldBlobUrls(oldLayouts: PwaLayout[], newLayouts: PwaLayout[]): void {
    const newBlobUrls = new Set(newLayouts.map(l => l.path).filter(p => p));
    let revokedCount = 0;

    for (const oldLayout of oldLayouts) {
      if (oldLayout.path && !newBlobUrls.has(oldLayout.path)) {
        console.log(`[PWA-XLR] Revoking old blob URL for layout ${oldLayout.layoutId}`);
        URL.revokeObjectURL(oldLayout.path);
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      console.log(`[PWA-XLR] Cleaned up ${revokedCount} old blob URLs`);
    }
  }

  /**
   * Setup UI elements
   */
  private setupUI() {
    // Add XLR container to page
    const container = document.getElementById('xlr-container');
    if (!container) {
      console.warn('[PWA-XLR] No #xlr-container found, XLR may not render properly');
    }

    // Update config display
    this.updateConfigDisplay();
  }

  /**
   * Update config display in UI
   */
  private updateConfigDisplay() {
    const configEl = document.getElementById('config-info');
    if (configEl) {
      configEl.textContent = `CMS: ${config.cmsAddress} | Display: ${config.displayName || config.hardwareKey}`;
    }
  }

  /**
   * Update status message in UI
   */
  private updateStatus(message: string, type: 'info' | 'error' = 'info') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status status-${type}`;
    }
    console.log(`[PWA-XLR] Status: ${message}`);
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    this.fileAdapter.cleanup();
    this.widgetParsingDetector.cleanup();

    // Stop XMR WebSocket connection
    if (this.xmr) {
      this.xmr.stop();
    }
  }
}

// Initialize player when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const player = new PwaXlrPlayer();
    player.init().catch(error => {
      console.error('[PWA-XLR] Failed to initialize:', error);
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      player.cleanup();
    });
  });
} else {
  const player = new PwaXlrPlayer();
  player.init().catch(error => {
    console.error('[PWA-XLR] Failed to initialize:', error);
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    player.cleanup();
  });
}
