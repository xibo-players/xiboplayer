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
import { DataConnectorManager } from './data-connectors.js';

const log = createLogger('PlayerCore');

// IndexedDB database/store for offline cache
const OFFLINE_DB_NAME = 'xibo-offline-cache';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = 'cache';

/** Open the offline cache IndexedDB (creates store on first use) */
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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

    // Data connectors manager (real-time data for widgets)
    this.dataConnectorManager = new DataConnectorManager();

    // State
    this.xmr = null;
    this.currentLayoutId = null;
    this.collecting = false;
    this.collectionInterval = null;
    this.pendingLayouts = new Map(); // layoutId -> required media IDs
    this.offlineMode = false; // Track whether we're currently in offline mode

    // CRC32 checksums for skip optimization (avoid redundant XMDS calls)
    this._lastCheckRf = null;
    this._lastCheckSchedule = null;

    // Layout override state (for changeLayout/overlayLayout via XMR → revertToSchedule)
    this._layoutOverride = null; // { layoutId, type: 'change'|'overlay' }
    this._lastRequiredFiles = []; // Track files for MediaInventory

    // Schedule cycle state (round-robin through multiple layouts)
    this._currentLayoutIndex = 0;

    // Multi-display sync configuration (from RegisterDisplay syncGroup settings)
    this.syncConfig = null;
    this.syncManager = null; // Optional: set via setSyncManager() after RegisterDisplay

    // In-memory offline cache (populated from IndexedDB on first load)
    this._offlineCache = { schedule: null, settings: null, requiredFiles: null };
    this._offlineDbReady = this._initOfflineCache();
  }

  // ── Offline Cache (IndexedDB) ──────────────────────────────────────

  /** Load offline cache from IndexedDB into memory on startup */
  async _initOfflineCache() {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_STORE);

      const [schedule, settings, requiredFiles] = await Promise.all([
        new Promise(r => { const req = store.get('schedule'); req.onsuccess = () => r(req.result ?? null); req.onerror = () => r(null); }),
        new Promise(r => { const req = store.get('settings'); req.onsuccess = () => r(req.result ?? null); req.onerror = () => r(null); }),
        new Promise(r => { const req = store.get('requiredFiles'); req.onsuccess = () => r(req.result ?? null); req.onerror = () => r(null); }),
      ]);

      this._offlineCache = { schedule, settings, requiredFiles };
      db.close();
      console.log('[PlayerCore] Offline cache loaded from IndexedDB',
        schedule ? '(has schedule)' : '(empty)');
    } catch (e) {
      console.warn('[PlayerCore] Failed to load offline cache from IndexedDB:', e);
    }
  }

  /** Save a key to both in-memory cache and IndexedDB (fire-and-forget) */
  async _offlineSave(key, data) {
    this._offlineCache[key] = data;
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(data, key);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (e) {
      console.warn('[PlayerCore] Failed to save offline cache:', key, e);
    }
  }

  /** Check if we have any cached data to fall back on */
  hasCachedData() {
    return this._offlineCache.schedule !== null;
  }

  /** Check if the browser reports being offline */
  isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /** Check if currently in offline mode */
  isInOfflineMode() {
    return this.offlineMode;
  }

  /**
   * Run an offline collection cycle using cached data.
   * Evaluates the cached schedule and continues playback.
   */
  collectOffline() {
    console.warn('[PlayerCore] Offline mode — using cached schedule');

    if (!this.offlineMode) {
      this.offlineMode = true;
      this.emit('offline-mode', true);
    }

    // Load cached settings for collection interval (first run only)
    if (!this.collectionInterval) {
      const cachedReg = this._offlineCache.settings;
      if (cachedReg?.settings) {
        this.setupCollectionInterval(cachedReg.settings);
      }
    }

    // Load cached schedule and apply it
    const cachedSchedule = this._offlineCache.schedule;
    if (cachedSchedule) {
      this.schedule.setSchedule(cachedSchedule);
      this.emit('schedule-received', cachedSchedule);
    }

    // Evaluate current schedule (same logic as online path)
    const layoutFiles = this.schedule.getCurrentLayouts();
    log.info('Offline layouts:', layoutFiles);
    this.emit('layouts-scheduled', layoutFiles);

    if (layoutFiles.length > 0) {
      // If a layout is currently playing and still in the schedule, don't interrupt
      if (this.currentLayoutId) {
        const currentStillScheduled = layoutFiles.some(f =>
          parseInt(String(f).replace('.xlf', ''), 10) === this.currentLayoutId
        );
        if (currentStillScheduled) {
          const idx = layoutFiles.findIndex(f =>
            parseInt(String(f).replace('.xlf', ''), 10) === this.currentLayoutId
          );
          if (idx >= 0) this._currentLayoutIndex = idx;
          log.debug(`Layout ${this.currentLayoutId} still in schedule (offline), continuing playback`);
          this.emit('layout-already-playing', this.currentLayoutId);
        } else {
          // Current layout not in schedule — switch
          this._currentLayoutIndex = 0;
          const next = this.getNextLayout();
          if (next) {
            log.info(`Offline: switching to layout ${next.layoutId}`);
            this.emit('layout-prepare-request', next.layoutId);
          }
        }
      } else {
        // No current layout — start the first one
        this._currentLayoutIndex = 0;
        const next = this.getNextLayout();
        if (next) {
          log.info(`Offline: switching to layout ${next.layoutId}`);
          this.emit('layout-prepare-request', next.layoutId);
        }
      }
    } else {
      log.info('Offline: no layouts in cached schedule');
      this.emit('no-layouts-scheduled');
    }

    this.emit('collection-complete');
  }

  /**
   * Force an immediate collection (used by platform layer on 'online' event)
   */
  async collectNow() {
    this._lastCheckRf = null;
    this._lastCheckSchedule = null;
    return this.collect();
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
      // Ensure offline cache is loaded from IndexedDB before checking
      await this._offlineDbReady;

      log.info('Starting collection cycle...');
      this.emit('collection-start');

      // Check if browser reports offline
      if (this.isOffline()) {
        if (this.hasCachedData()) {
          return this.collectOffline();
        }
        throw new Error('Offline with no cached data — cannot start playback');
      }

      // Register display
      const regResult = await this.xmds.registerDisplay();
      log.info('Display registered:', regResult);

      // Cache settings for offline use
      this._offlineSave('settings', regResult);

      // Exit offline mode if we were in it
      if (this.offlineMode) {
        this.offlineMode = false;
        console.log('[PlayerCore] Back online — resuming normal collection');
        this.emit('offline-mode', false);
      }

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

      // Store sync config if display is in a sync group
      if (regResult.syncConfig) {
        this.syncConfig = regResult.syncConfig;
        log.info('Sync group:', regResult.syncConfig.isLead ? 'LEAD' : `follower → ${regResult.syncConfig.syncGroup}`,
          `(switchDelay: ${regResult.syncConfig.syncSwitchDelay}ms, videoPauseDelay: ${regResult.syncConfig.syncVideoPauseDelay}ms)`);
        this.emit('sync-config', regResult.syncConfig);
      }

      this.emit('register-complete', regResult);

      // Initialize XMR if available
      await this.initializeXmr(regResult);

      // CRC32 skip optimization: only fetch RequiredFiles/Schedule when CMS data changed
      const checkRf = regResult.checkRf || '';
      const checkSchedule = regResult.checkSchedule || '';

      // Get required files (skip if CRC unchanged)
      if (!this._lastCheckRf || this._lastCheckRf !== checkRf) {
        const allFiles = await this.xmds.requiredFiles();
        // Separate purge entries from download entries
        const purgeFiles = allFiles.filter(f => f.type === 'purge');
        const files = allFiles.filter(f => f.type !== 'purge');
        log.info('Required files:', files.length, purgeFiles.length > 0 ? `(+ ${purgeFiles.length} purge)` : '');
        this._lastCheckRf = checkRf;
        this.emit('files-received', files);

        // Cache required files for offline use
        this._offlineSave('requiredFiles', allFiles);

        if (purgeFiles.length > 0) {
          this.emit('purge-request', purgeFiles);
        }

        // Get schedule (skip if CRC unchanged)
        if (!this._lastCheckSchedule || this._lastCheckSchedule !== checkSchedule) {
          const schedule = await this.xmds.schedule();
          log.info('Schedule received');
          this._lastCheckSchedule = checkSchedule;
          this.emit('schedule-received', schedule);
          this.schedule.setSchedule(schedule);
          this.updateDataConnectors();
          this._offlineSave('schedule', schedule);
        }

        // Prioritize downloads by layout priority (highest first)
        const currentLayouts = this.schedule.getCurrentLayouts();
        const prioritizedFiles = this.prioritizeFilesByLayout(files, currentLayouts);
        this._lastRequiredFiles = files;
        this.emit('download-request', prioritizedFiles);

        // Submit media inventory to CMS (reports cached files)
        this.submitMediaInventory(files);
      } else {
        if (checkRf) {
          log.info('RequiredFiles CRC unchanged, skipping download check');
        }
        if (this._lastCheckSchedule !== checkSchedule) {
          const schedule = await this.xmds.schedule();
          log.info('Schedule received (RF unchanged but schedule changed)');
          this._lastCheckSchedule = checkSchedule;
          this.emit('schedule-received', schedule);
          this.schedule.setSchedule(schedule);
          this.updateDataConnectors();
          this._offlineSave('schedule', schedule);
        } else if (checkSchedule) {
          log.info('Schedule CRC unchanged, skipping');
        }
      }

      // Evaluate current schedule
      const layoutFiles = this.schedule.getCurrentLayouts();
      log.info('Current layouts:', layoutFiles);
      this.emit('layouts-scheduled', layoutFiles);

      if (layoutFiles.length > 0) {
        // If a layout is currently playing and it's still in the schedule, don't interrupt it.
        // Let it finish its natural duration — advanceToNextLayout() handles the transition.
        if (this.currentLayoutId) {
          const currentStillScheduled = layoutFiles.some(f =>
            parseInt(String(f).replace('.xlf', ''), 10) === this.currentLayoutId
          );
          if (currentStillScheduled) {
            // Update round-robin index to match current layout's position
            const idx = layoutFiles.findIndex(f =>
              parseInt(String(f).replace('.xlf', ''), 10) === this.currentLayoutId
            );
            if (idx >= 0) this._currentLayoutIndex = idx;
            log.debug(`Layout ${this.currentLayoutId} still in schedule, continuing playback`);
            this.emit('layout-already-playing', this.currentLayoutId);
          } else {
            // Current layout is not in the schedule (unscheduled or filtered) — switch
            this._currentLayoutIndex = 0;
            const next = this.getNextLayout();
            if (next) {
              log.info(`Switching to layout ${next.layoutId} (from ${this.currentLayoutId})`);
              this.emit('layout-prepare-request', next.layoutId);
            }
          }
        } else {
          // No current layout — start the first one
          this._currentLayoutIndex = 0;
          const next = this.getNextLayout();
          if (next) {
            log.info(`Switching to layout ${next.layoutId}`);
            this.emit('layout-prepare-request', next.layoutId);
          }
        }
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

      // Submit logs to CMS (always, regardless of stats setting)
      this.emit('submit-logs-request');

      // Setup collection interval on first run
      if (!this.collectionInterval && regResult.settings) {
        this.setupCollectionInterval(regResult.settings);
      }

      this.emit('collection-complete');

    } catch (error) {
      // Offline fallback: if network failed but we have cached data, use it
      if (this.hasCachedData()) {
        console.warn('[PlayerCore] Collection failed, falling back to cached data:', error?.message || error);
        this.emit('collection-error', error);
        return this.collectOffline();
      }

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
    if (!xmrUrl) {
      log.warn('XMR not configured: no xmrWebSocketAddress or xmrNetworkAddress in CMS settings');
      this.emit('xmr-misconfigured', {
        reason: 'missing',
        message: 'XMR address not configured in CMS. Go to CMS Admin → Settings → Configuration → XMR and set the WebSocket address.',
      });
      return;
    }

    // Validate URL protocol — PWA players need ws:// or wss://, not tcp://
    if (xmrUrl.startsWith('tcp://')) {
      log.warn(`XMR address uses tcp:// protocol which is not supported by PWA players: ${xmrUrl}`);
      log.warn('Configure XMR_WS_ADDRESS in CMS Admin → Settings → Configuration → XMR (e.g. wss://your-domain/xmr)');
      this.emit('xmr-misconfigured', {
        reason: 'wrong-protocol',
        url: xmrUrl,
        message: `XMR uses tcp:// protocol (not supported by PWA). Set XMR WebSocket Address to wss://your-domain/xmr in CMS Settings.`,
      });
      return;
    }

    // Detect placeholder/example URLs
    if (/example\.(org|com|net)/i.test(xmrUrl)) {
      log.warn(`XMR address contains placeholder domain: ${xmrUrl}`);
      log.warn('Configure the real XMR address in CMS Admin → Settings → Configuration → XMR');
      this.emit('xmr-misconfigured', {
        reason: 'placeholder',
        url: xmrUrl,
        message: `XMR address is still the default placeholder (${xmrUrl}). Update it in CMS Settings.`,
      });
      return;
    }

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
   * Get the next layout from the schedule using round-robin cycling.
   * Returns { layoutId, layoutFile } or null if no layouts are scheduled.
   */
  getNextLayout() {
    const layoutFiles = this.schedule.getCurrentLayouts();
    if (layoutFiles.length === 0) {
      return null;
    }

    // Wrap index in case schedule shrank
    if (this._currentLayoutIndex >= layoutFiles.length) {
      this._currentLayoutIndex = 0;
    }

    const layoutFile = layoutFiles[this._currentLayoutIndex];
    const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);
    return { layoutId, layoutFile };
  }

  /**
   * Peek at the next layout in the schedule without advancing the index.
   * Used by the preload system to know which layout to pre-build.
   * Returns { layoutId, layoutFile } or null if no next layout or same as current.
   */
  peekNextLayout() {
    const layoutFiles = this.schedule.getCurrentLayouts();
    if (layoutFiles.length <= 1) {
      // Single layout or empty schedule - no different layout to preload
      return null;
    }

    const nextIndex = (this._currentLayoutIndex + 1) % layoutFiles.length;
    const layoutFile = layoutFiles[nextIndex];
    const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);

    // Don't return if it's the same as current (no point preloading)
    if (layoutId === this.currentLayoutId) {
      return null;
    }

    return { layoutId, layoutFile };
  }

  /**
   * Advance to the next layout in the schedule (round-robin).
   * Called by platform layer when a layout finishes (layoutEnd event).
   * Increments the index and emits layout-prepare-request for the next layout,
   * or triggers replay if only one layout is scheduled.
   */
  advanceToNextLayout() {
    // Don't cycle if we're in a layout override (XMR changeLayout/overlayLayout)
    if (this._layoutOverride) {
      log.info('Layout override active, not advancing schedule');
      return;
    }

    const layoutFiles = this.schedule.getCurrentLayouts();
    log.info(`Advancing schedule: ${layoutFiles.length} layout(s) available, current index ${this._currentLayoutIndex}`);

    if (layoutFiles.length === 0) {
      log.info('No layouts scheduled during advance');
      this.emit('no-layouts-scheduled');
      return;
    }

    // Advance index (wraps around)
    this._currentLayoutIndex = (this._currentLayoutIndex + 1) % layoutFiles.length;

    const layoutFile = layoutFiles[this._currentLayoutIndex];
    const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);

    // Multi-display sync: if this is a sync event and we have a SyncManager,
    // delegate layout transitions to the sync protocol
    if (this.syncManager && this.schedule.isSyncEvent(layoutFile)) {
      if (this.isSyncLead()) {
        // Lead: coordinate with followers before showing
        log.info(`[Sync] Lead requesting coordinated layout change: ${layoutId}`);
        this.syncManager.requestLayoutChange(layoutId).catch(err => {
          log.error('[Sync] Layout change failed:', err);
          // Fallback: show layout anyway
          this.emit('layout-prepare-request', layoutId);
        });
        return;
      } else {
        // Follower: don't advance independently — wait for lead's layout-change signal
        log.info(`[Sync] Follower waiting for lead signal (not advancing independently)`);
        return;
      }
    }

    if (layoutId === this.currentLayoutId) {
      // Same layout (single layout schedule or wrapped back) — trigger replay
      log.info(`Next layout ${layoutId} is same as current, triggering replay`);
      this.currentLayoutId = null; // Clear to allow re-render
    }

    log.info(`Advancing to layout ${layoutId} (index ${this._currentLayoutIndex}/${layoutFiles.length})`);
    this.emit('layout-prepare-request', layoutId);
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
   * Capture screenshot (called by XMR wrapper)
   * Emits event for platform layer to handle
   */
  async captureScreenshot() {
    log.info('Screenshot requested');
    this.emit('screenshot-request');
  }

  /**
   * Change to a specific layout (called by XMR wrapper)
   * Tracks override state so revertToSchedule() can undo it.
   */
  async changeLayout(layoutId) {
    log.info('Layout change requested via XMR:', layoutId);
    this._layoutOverride = { layoutId: parseInt(layoutId, 10), type: 'change' };
    this.currentLayoutId = null; // Force re-render
    this.emit('layout-prepare-request', parseInt(layoutId, 10));
  }

  /**
   * Push an overlay layout on top of current content (called by XMR wrapper)
   * @param {number|string} layoutId - Layout to overlay
   */
  async overlayLayout(layoutId) {
    log.info('Overlay layout requested via XMR:', layoutId);
    this._layoutOverride = { layoutId: parseInt(layoutId, 10), type: 'overlay' };
    this.emit('overlay-layout-request', parseInt(layoutId, 10));
  }

  /**
   * Revert to scheduled content after changeLayout/overlayLayout override
   */
  async revertToSchedule() {
    log.info('Reverting to scheduled content');
    this._layoutOverride = null;
    this.currentLayoutId = null;
    this.emit('revert-to-schedule');

    // Re-evaluate schedule to get the right layout
    const layoutFiles = this.schedule.getCurrentLayouts();
    if (layoutFiles.length > 0) {
      const layoutFile = layoutFiles[0];
      const layoutId = parseInt(layoutFile.replace('.xlf', ''), 10);
      this.emit('layout-prepare-request', layoutId);
    } else {
      this.emit('no-layouts-scheduled');
    }
  }

  /**
   * Purge all cached content and re-download (called by XMR wrapper)
   */
  async purgeAll() {
    log.info('Purge all cache requested via XMR');
    this._lastCheckRf = null;
    this._lastCheckSchedule = null;
    this.emit('purge-all-request');
    // Trigger immediate re-collection after purge
    return this.collectNow();
  }

  /**
   * Execute a command (HTTP only in browser context)
   * @param {string} commandCode - The command code from CMS
   * @param {Object} commands - Commands map from display settings
   */
  async executeCommand(commandCode, commands) {
    log.info('Execute command requested:', commandCode);

    if (!commands || !commands[commandCode]) {
      log.warn('Unknown command code:', commandCode);
      this.emit('command-result', { code: commandCode, success: false, reason: 'Unknown command' });
      return;
    }

    const command = commands[commandCode];
    const commandString = command.commandString || command.value || '';

    // Only HTTP commands are possible in a browser
    if (commandString.startsWith('http|')) {
      const parts = commandString.split('|');
      const url = parts[1];
      const contentType = parts[2] || 'application/json';

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': contentType }
        });
        const success = response.ok;
        log.info(`HTTP command ${commandCode} result: ${response.status}`);
        this.emit('command-result', { code: commandCode, success, status: response.status });
      } catch (error) {
        log.error(`HTTP command ${commandCode} failed:`, error);
        this.emit('command-result', { code: commandCode, success: false, reason: error.message });
      }
    } else {
      log.warn('Non-HTTP commands not supported in browser:', commandCode);
      this.emit('command-result', { code: commandCode, success: false, reason: 'Only HTTP commands supported in browser' });
    }
  }

  /**
   * Trigger a webhook action (called by XMR wrapper)
   * @param {string} triggerCode - The trigger code to fire
   */
  triggerWebhook(triggerCode) {
    log.info('Webhook trigger from XMR:', triggerCode);
    this.handleTrigger(triggerCode);
  }

  /**
   * Force refresh of data connectors (called by XMR wrapper)
   */
  refreshDataConnectors() {
    log.info('Data connector refresh requested via XMR');
    this.dataConnectorManager.refreshAll();
    this.emit('data-connectors-refreshed');
  }

  /**
   * Submit media inventory to CMS
   * Reports which files are cached and complete.
   * @param {Array} files - List of files from RequiredFiles
   */
  async submitMediaInventory(files) {
    if (!files || files.length === 0) return;

    try {
      // Build inventory XML: <files><file type="media" id="1" complete="1" md5="abc" lastChecked="123"/></files>
      const now = Math.floor(Date.now() / 1000);
      const fileEntries = files
        .filter(f => f.type === 'media' || f.type === 'layout')
        .map(f => `<file type="${f.type}" id="${f.id}" complete="1" md5="${f.md5 || ''}" lastChecked="${now}"/>`)
        .join('');
      const inventoryXml = `<files>${fileEntries}</files>`;

      await this.xmds.mediaInventory(inventoryXml);
      log.info(`Media inventory submitted: ${files.length} files`);
      this.emit('media-inventory-submitted', files.length);
    } catch (error) {
      log.warn('MediaInventory submission failed:', error);
    }
  }

  /**
   * BlackList a media file (report broken media to CMS)
   * @param {string|number} mediaId - The media ID
   * @param {string} type - File type ('media' or 'layout')
   * @param {string} reason - Reason for blacklisting
   */
  async blackList(mediaId, type, reason) {
    try {
      await this.xmds.blackList(mediaId, type, reason);
      this.emit('media-blacklisted', { mediaId, type, reason });
    } catch (error) {
      log.warn('BlackList failed:', error);
    }
  }

  /**
   * Check if currently in a layout override (from XMR changeLayout/overlayLayout)
   */
  isLayoutOverridden() {
    return this._layoutOverride !== null;
  }

  /**
   * Handle interactive trigger (from IC or touch events)
   * Looks up matching action in schedule and executes it
   * @param {string} triggerCode - The trigger code from the IC request
   */
  handleTrigger(triggerCode) {
    const action = this.schedule.findActionByTrigger(triggerCode);
    if (!action) {
      log.debug('No scheduled action matches trigger:', triggerCode);
      return;
    }

    log.info(`Action triggered: ${action.actionType} (trigger: ${triggerCode})`);

    switch (action.actionType) {
      case 'navLayout':
      case 'navigateToLayout':
        if (action.layoutCode) {
          this.changeLayout(action.layoutCode);
        }
        break;
      case 'navWidget':
      case 'navigateToWidget':
        this.emit('navigate-to-widget', action);
        break;
      case 'command':
        this.emit('execute-command', action.commandCode);
        break;
      default:
        log.warn('Unknown action type:', action.actionType);
    }
  }

  /**
   * Update data connectors from current schedule
   * Reconfigures and restarts polling when schedule changes.
   */
  updateDataConnectors() {
    const connectors = this.schedule.getDataConnectors();

    if (connectors.length > 0) {
      log.info(`Configuring ${connectors.length} data connector(s)`);
    }

    this.dataConnectorManager.setConnectors(connectors);

    if (connectors.length > 0) {
      this.dataConnectorManager.startPolling();
      this.emit('data-connectors-started', connectors.length);
    }
  }

  /**
   * Get the DataConnectorManager instance
   * Used by platform layer to serve data to widgets via IC /realtime
   * @returns {DataConnectorManager}
   */
  getDataConnectorManager() {
    return this.dataConnectorManager;
  }

  /**
   * Set the SyncManager instance for multi-display coordination.
   * Called by platform layer after RegisterDisplay returns syncConfig.
   *
   * @param {SyncManager} syncManager - SyncManager instance
   */
  setSyncManager(syncManager) {
    this.syncManager = syncManager;
    log.info('SyncManager attached:', syncManager.isLead ? 'LEAD' : 'FOLLOWER');
  }

  /**
   * Check if this display is part of a sync group
   * @returns {boolean}
   */
  isInSyncGroup() {
    return this.syncConfig !== null;
  }

  /**
   * Check if this display is the sync group leader
   * @returns {boolean}
   */
  isSyncLead() {
    return this.syncConfig?.isLead === true;
  }

  /**
   * Get sync configuration
   * @returns {Object|null} { syncGroup, syncPublisherPort, syncSwitchDelay, syncVideoPauseDelay, isLead }
   */
  getSyncConfig() {
    return this.syncConfig;
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

    // Stop multi-display sync
    if (this.syncManager) {
      this.syncManager.stop();
      this.syncManager = null;
    }

    // Stop data connector polling
    this.dataConnectorManager.cleanup();

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
   * Prioritize file downloads for fastest playback start:
   *   1. Layout XLFs for currently scheduled layouts (tiny, needed for parsing)
   *   2. Other layout XLFs (also tiny)
   *   3. Resource files (fonts, bundle.min.js — small, needed by widgets)
   *   4. Media files sorted by ascending size (small files complete faster)
   *
   * This ensures layouts are parseable ASAP so prepareAndRenderLayout() can
   * call prioritizeDownload() for the specific media the current layout needs.
   */
  prioritizeFilesByLayout(files, currentLayouts) {
    const currentLayoutIds = new Set();
    currentLayouts.forEach((layoutFile) => {
      currentLayoutIds.add(parseInt(String(layoutFile).replace('.xlf', ''), 10));
    });

    // Assign priority tiers
    const tiered = files.map(f => {
      let tier;
      if (f.type === 'layout') {
        const layoutId = parseInt(f.id);
        tier = currentLayoutIds.has(layoutId) ? 0 : 1; // Current layouts first
      } else if (f.type === 'resource' || f.code === 'fonts.css' ||
                 (f.path && (f.path.includes('bundle.min') || f.path.includes('fonts')))) {
        tier = 2; // Resources (fonts, bundle.min.js)
      } else {
        tier = 3; // Media
      }
      return { file: f, tier };
    });

    // Sort by tier, then by ascending size within each tier
    tiered.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return (a.file.size || 0) - (b.file.size || 0);
    });

    return tiered.map(t => t.file);
  }
}
