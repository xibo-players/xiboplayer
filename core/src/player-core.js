/**
 * PlayerCore - Platform-independent orchestration module
 *
 * Pure orchestration logic without platform-specific concerns (UI, DOM, storage).
 * Can be reused across PWA, Electron, mobile platforms.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │ PlayerCore (Pure Orchestration)                     │
 * │ - Collection cycle coordination                     │
 * │ - Schedule checking                                 │
 * │ - Layout transition logic                           │
 * │ - Event emission (not DOM manipulation)             │
 * │ - XMDS communication                                │
 * │ - XMR integration                                   │
 * └─────────────────────────────────────────────────────┘
 *                          ↓
 * ┌─────────────────────────────────────────────────────┐
 * │ Platform Layer (PWA/Electron/Mobile)                │
 * │ - UI updates (status display, progress bars)        │
 * │ - DOM manipulation                                  │
 * │ - Platform-specific storage                         │
 * │ - Blob URL management                               │
 * │ - Event listeners for PlayerCore events             │
 * └─────────────────────────────────────────────────────┘
 *
 * Usage:
 *   const core = new PlayerCore({
 *     config,
 *     xmds,
 *     cache,
 *     schedule,
 *     renderer,
 *     xmrWrapper
 *   });
 *
 *   // Listen to events
 *   core.on('collection-start', () => { ... });
 *   core.on('layout-ready', (layoutId) => { ... });
 *
 *   // Start collection
 *   await core.collect();
 */

import { EventEmitter } from './event-emitter.js';

export class PlayerCore extends EventEmitter {
  constructor(options) {
    super();

    // Required dependencies (injected)
    this.config = options.config;
    this.xmds = options.xmds;
    this.cache = options.cache;
    this.schedule = options.schedule;
    this.renderer = options.renderer;
    this.XmrWrapper = options.xmrWrapper;

    // State
    this.xmr = null;
    this.currentLayoutId = null;
    this.collecting = false;
    this.collectionInterval = null;
    this.pendingLayouts = new Map(); // layoutId -> required media IDs
  }

  /**
   * Start collection cycle
   * Pure orchestration - emits events instead of updating UI
   */
  async collect() {
    // Prevent concurrent collections
    if (this.collecting) {
      console.log('[PlayerCore] Collection already in progress, skipping');
      return;
    }

    this.collecting = true;

    try {
      console.log('[PlayerCore] Starting collection cycle...');
      this.emit('collection-start');

      // Register display
      const regResult = await this.xmds.registerDisplay();
      console.log('[PlayerCore] Display registered:', regResult);
      this.emit('register-complete', regResult);

      // Initialize XMR if available
      await this.initializeXmr(regResult);

      // Get required files
      const files = await this.xmds.requiredFiles();
      console.log('[PlayerCore] Required files:', files.length);
      this.emit('files-received', files);

      // Get schedule FIRST to determine priority
      const schedule = await this.xmds.schedule();
      console.log('[PlayerCore] Schedule received');
      this.emit('schedule-received', schedule);

      // Update schedule manager
      this.schedule.setSchedule(schedule);

      // Prioritize downloads by layout priority (highest first)
      const currentLayouts = this.schedule.getCurrentLayouts();
      const prioritizedFiles = this.prioritizeFilesByLayout(files, currentLayouts);

      // Request downloads with priority order
      this.emit('download-request', prioritizedFiles);

      // Get current layouts from schedule
      const layoutFiles = this.schedule.getCurrentLayouts();
      console.log('[PlayerCore] Current layouts:', layoutFiles);
      this.emit('layouts-scheduled', layoutFiles);

      if (layoutFiles.length > 0) {
        // For now, play the first layout
        // TODO: Implement full schedule cycling
        const layoutFile = layoutFiles[0];
        const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);

        // Skip if already playing this layout
        if (this.currentLayoutId === layoutId) {
          console.log(`[PlayerCore] Layout ${layoutId} already playing, skipping reload`);
          this.emit('layout-already-playing', layoutId);
          return;
        }

        // Request layout preparation (platform handles media checks, widget HTML)
        this.emit('layout-prepare-request', layoutId);

      } else {
        console.log('[PlayerCore] No layouts scheduled');
        this.emit('no-layouts-scheduled');
      }

      // Setup collection interval on first run
      if (!this.collectionInterval && regResult.settings) {
        this.setupCollectionInterval(regResult.settings);
      }

      this.emit('collection-complete');

    } catch (error) {
      console.error('[PlayerCore] Collection error:', error);
      this.emit('collection-error', error);
      throw error;
    } finally {
      this.collecting = false;
    }
  }

  /**
   * Initialize XMR WebSocket connection
   */
  async initializeXmr(regResult) {
    const xmrUrl = regResult.settings?.xmrWebSocketAddress || regResult.settings?.xmrNetworkAddress;
    if (!xmrUrl) return;

    const xmrCmsKey = regResult.settings?.xmrCmsKey || regResult.settings?.serverKey || this.config.serverKey;
    console.log('[PlayerCore] XMR CMS Key:', xmrCmsKey ? 'present' : 'missing');

    if (!this.xmr) {
      console.log('[PlayerCore] Initializing XMR WebSocket:', xmrUrl);
      this.xmr = new this.XmrWrapper(this.config, this);
      await this.xmr.start(xmrUrl, xmrCmsKey);
      this.emit('xmr-connected', xmrUrl);
    } else if (!this.xmr.isConnected()) {
      console.log('[PlayerCore] XMR disconnected, attempting to reconnect...');
      this.xmr.reconnectAttempts = 0;
      await this.xmr.start(xmrUrl, xmrCmsKey);
      this.emit('xmr-reconnected', xmrUrl);
    } else {
      console.log('[PlayerCore] XMR already connected');
    }
  }

  /**
   * Setup collection interval
   */
  setupCollectionInterval(settings) {
    const collectIntervalSeconds = parseInt(settings.collectInterval || '300', 10);
    const collectIntervalMs = collectIntervalSeconds * 1000;

    console.log(`[PlayerCore] Setting up collection interval: ${collectIntervalSeconds}s`);

    this.collectionInterval = setInterval(() => {
      console.log('[PlayerCore] Running scheduled collection cycle...');
      this.collect().catch(error => {
        console.error('[PlayerCore] Collection error:', error);
        this.emit('collection-error', error);
      });
    }, collectIntervalMs);

    this.emit('collection-interval-set', collectIntervalSeconds);
  }

  /**
   * Request layout change (called by XMR or schedule)
   * Pure orchestration - emits events for platform to handle
   */
  async requestLayoutChange(layoutId) {
    console.log(`[PlayerCore] Layout change requested: ${layoutId}`);

    // Clear current layout tracking so it will switch
    this.currentLayoutId = null;

    this.emit('layout-change-requested', layoutId);
  }

  /**
   * Mark layout as ready and current
   * Called by platform after it successfully renders the layout
   */
  setCurrentLayout(layoutId) {
    this.currentLayoutId = layoutId;
    this.pendingLayouts.delete(layoutId);
    this.emit('layout-current', layoutId);
  }

  /**
   * Mark layout as pending (waiting for media)
   * Called by platform when layout needs media downloads
   */
  setPendingLayout(layoutId, requiredMediaIds) {
    this.pendingLayouts.set(layoutId, requiredMediaIds);
    this.emit('layout-pending', layoutId, requiredMediaIds);
  }

  /**
   * Clear current layout (for replay)
   * Called by platform when layout ends
   */
  clearCurrentLayout() {
    this.currentLayoutId = null;
    this.emit('layout-cleared');
  }

  /**
   * Notify that a file is ready (called by platform for both layout and media files)
   * Checks if any pending layouts can now be rendered
   */
  notifyMediaReady(fileId, fileType = 'media') {
    console.log(`[PlayerCore] File ${fileId} ready (${fileType})`);

    // Check if any pending layouts are now complete
    for (const [layoutId, requiredFiles] of this.pendingLayouts.entries()) {
      // Check if this file is needed by this layout
      // For layout files: match layout ID with file ID (layout 78 needs layout/78)
      // For media files: check if fileId is in requiredFiles array
      const isLayoutFile = fileType === 'layout' && layoutId === parseInt(fileId);
      const isRequiredMedia = fileType === 'media' && requiredFiles.includes(parseInt(fileId));

      if (isLayoutFile || isRequiredMedia) {
        console.log(`[PlayerCore] ${fileType} ${fileId} was needed by pending layout ${layoutId}, checking if ready...`);
        this.emit('check-pending-layout', layoutId, requiredFiles);
      }
    }
  }

  /**
   * Notify layout status to CMS
   */
  async notifyLayoutStatus(layoutId) {
    try {
      await this.xmds.notifyStatus({ currentLayoutId: layoutId });
      this.emit('status-notified', layoutId);
    } catch (error) {
      console.warn('[PlayerCore] Failed to notify status:', error);
      this.emit('status-notify-failed', layoutId, error);
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    if (this.xmr) {
      this.xmr.stop();
      this.xmr = null;
    }

    // Emit cleanup-complete before removing listeners
    this.emit('cleanup-complete');
    this.removeAllListeners();
  }

  /**
   * Get current layout ID
   */
  getCurrentLayoutId() {
    return this.currentLayoutId;
  }

  /**
   * Check if collecting
   */
  isCollecting() {
    return this.collecting;
  }

  /**
   * Get pending layouts
   */
  getPendingLayouts() {
    return Array.from(this.pendingLayouts.keys());
  }

  /**
   * Prioritize file downloads by layout priority
   * Files for highest-priority layout download first
   */
  prioritizeFilesByLayout(files, currentLayouts) {
    const layoutPriority = new Map();
    currentLayouts.forEach((layoutFile, index) => {
      const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);
      layoutPriority.set(layoutId, index);
    });

    return [...files].sort((a, b) => {
      const layoutIdA = a.type === 'layout' ? parseInt(a.id) : parseInt(a.layoutId || a.id);
      const layoutIdB = b.type === 'layout' ? parseInt(b.id) : parseInt(b.layoutId || b.id);
      const priorityA = layoutPriority.get(layoutIdA) ?? 999;
      const priorityB = layoutPriority.get(layoutIdB) ?? 999;
      return priorityA - priorityB;
    });
  }
}
