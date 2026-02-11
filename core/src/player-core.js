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

import { EventEmitter, createLogger, applyCmsLogLevel } from '@xiboplayer/utils';

const log = createLogger('PlayerCore');

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
    this.statsCollector = options.statsCollector; // Optional: proof of play tracking
    this.displaySettings = options.displaySettings; // Optional: CMS display settings manager

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
      log.debug('Collection already in progress, skipping');
      return;
    }

    this.collecting = true;

    try {
      log.info('Starting collection cycle...');
      this.emit('collection-start');

      // Register display
      const regResult = await this.xmds.registerDisplay();
      log.info('Display registered:', regResult);

      // Apply display settings if DisplaySettings manager is available
      if (this.displaySettings && regResult.settings) {
        const result = this.displaySettings.applySettings(regResult.settings);
        if (result.changed.includes('collectInterval')) {
          // Collection interval changed - update interval
          this.updateCollectionInterval(result.settings.collectInterval);
        }

        // Apply CMS logLevel (respects local overrides)
        if (regResult.settings.logLevel) {
          const applied = applyCmsLogLevel(regResult.settings.logLevel);
          if (applied) {
            log.info('Log level updated from CMS:', regResult.settings.logLevel);
            this.emit('log-level-changed', regResult.settings.logLevel);
          }
        }
      }

      this.emit('register-complete', regResult);

      // Initialize XMR if available
      await this.initializeXmr(regResult);

      // Get required files
      const files = await this.xmds.requiredFiles();
      log.info('Required files:', files.length);
      this.emit('files-received', files);

      // Get schedule FIRST to determine priority
      const schedule = await this.xmds.schedule();
      log.info('Schedule received');
      this.emit('schedule-received', schedule);

      // Update schedule manager
      this.schedule.setSchedule(schedule);

      // Prioritize downloads by layout priority (highest first)
      const currentLayouts = this.schedule.getCurrentLayouts();
      const prioritizedFiles = this.prioritizeFilesByLayout(files, currentLayouts);

      // Request downloads with priority order
      this.emit('download-request', prioritizedFiles);

      // Use same schedule result (avoid duplicate evaluation)
      const layoutFiles = currentLayouts;
      log.info('Current layouts:', layoutFiles);
      this.emit('layouts-scheduled', layoutFiles);

      if (layoutFiles.length > 0) {
        // For now, play the first layout
        // TODO: Implement full schedule cycling
        const layoutFile = layoutFiles[0];
        const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);

        // Skip if already playing this layout
        if (this.currentLayoutId === layoutId) {
          log.debug(`Layout ${layoutId} already playing, skipping reload`);
          this.emit('layout-already-playing', layoutId);
          return;
        }

        // Request layout preparation (platform handles media checks, widget HTML)
        log.info(`Switching to layout ${layoutId}${this.currentLayoutId ? ` (from ${this.currentLayoutId})` : ''}`);
        this.emit('layout-prepare-request', layoutId);

      } else {
        log.info('No layouts scheduled, falling back to default');
        this.emit('no-layouts-scheduled');

        // If we're currently playing a layout but schedule says no layouts (e.g., maxPlaysPerHour filtered it),
        // force switch to default layout if available
        if (this.currentLayoutId && this.schedule.schedule?.default) {
          const defaultLayoutId = parseInt(this.schedule.schedule.default.replace('.xlf', ''), 10);
          log.info(`Current layout filtered by schedule, switching to default layout ${defaultLayoutId}`);
          this.currentLayoutId = null; // Clear to force switch
          this.emit('layout-prepare-request', defaultLayoutId);
        }
      }

      // Submit stats if enabled and collector is available
      if (regResult.settings?.statsEnabled === 'On' || regResult.settings?.statsEnabled === '1') {
        if (this.statsCollector) {
          log.info('Stats enabled, submitting proof of play');
          this.emit('submit-stats-request');
        } else {
          log.warn('Stats enabled but no StatsCollector provided');
        }
      }

      // Setup collection interval on first run
      if (!this.collectionInterval && regResult.settings) {
        this.setupCollectionInterval(regResult.settings);
      }

      this.emit('collection-complete');

    } catch (error) {
      log.error('Collection error:', error);
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
    log.debug('XMR CMS Key:', xmrCmsKey ? 'present' : 'missing');

    if (!this.xmr) {
      log.info('Initializing XMR WebSocket:', xmrUrl);
      this.xmr = new this.XmrWrapper(this.config, this);
      await this.xmr.start(xmrUrl, xmrCmsKey);
      this.emit('xmr-connected', xmrUrl);
    } else if (!this.xmr.isConnected()) {
      log.info('XMR disconnected, attempting to reconnect...');
      this.xmr.reconnectAttempts = 0;
      await this.xmr.start(xmrUrl, xmrCmsKey);
      this.emit('xmr-reconnected', xmrUrl);
    } else {
      log.debug('XMR already connected');
    }
  }

  /**
   * Setup collection interval
   */
  setupCollectionInterval(settings) {
    // Use DisplaySettings if available, otherwise fallback to raw settings
    const collectIntervalSeconds = this.displaySettings
      ? this.displaySettings.getCollectInterval()
      : parseInt(settings.collectInterval || '300', 10);

    const collectIntervalMs = collectIntervalSeconds * 1000;

    log.info(`Setting up collection interval: ${collectIntervalSeconds}s`);

    this.collectionInterval = setInterval(() => {
      log.debug('Running scheduled collection cycle...');
      this.collect().catch(error => {
        log.error('Collection error:', error);
        this.emit('collection-error', error);
      });
    }, collectIntervalMs);

    this.emit('collection-interval-set', collectIntervalSeconds);
  }

  /**
   * Update collection interval dynamically
   * Called when CMS changes the collection interval
   */
  updateCollectionInterval(newIntervalSeconds) {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      log.info(`Updating collection interval: ${newIntervalSeconds}s`);

      const collectIntervalMs = newIntervalSeconds * 1000;

      this.collectionInterval = setInterval(() => {
        log.debug('Running scheduled collection cycle...');
        this.collect().catch(error => {
          log.error('Collection error:', error);
          this.emit('collection-error', error);
        });
      }, collectIntervalMs);

      this.emit('collection-interval-updated', newIntervalSeconds);
    }
  }

  /**
   * Request layout change (called by XMR or schedule)
   * Pure orchestration - emits events for platform to handle
   */
  async requestLayoutChange(layoutId) {
    log.info(`Layout change requested: ${layoutId}`);

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
    log.debug(`File ${fileId} ready (${fileType})`);

    // Check if any pending layouts are now complete
    for (const [layoutId, requiredFiles] of this.pendingLayouts.entries()) {
      // Check if this file is needed by this layout
      // For layout files: match layout ID with file ID (layout 78 needs layout/78)
      // For media files: check if fileId is in requiredFiles array
      const isLayoutFile = fileType === 'layout' && layoutId === parseInt(fileId);
      const isRequiredMedia = fileType === 'media' && requiredFiles.includes(parseInt(fileId));

      if (isLayoutFile || isRequiredMedia) {
        log.debug(`${fileType} ${fileId} was needed by pending layout ${layoutId}, checking if ready...`);
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
      log.warn('Failed to notify status:', error);
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
