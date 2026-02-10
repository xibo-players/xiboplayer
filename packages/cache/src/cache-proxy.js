/**
 * CacheProxy - Service Worker cache interface
 *
 * Provides a proxy to Service Worker for background downloads and caching.
 * Service Worker MUST be available - no fallback (committed to SW architecture).
 *
 * Architecture:
 * ┌─────────────────────────────────────────┐
 * │ CacheProxy (Service Worker Only)        │
 * │ - Waits for Service Worker ready        │
 * │ - Routes all requests to SW             │
 * │ - No fallback to direct cache           │
 * └─────────────────────────────────────────┘
 *             ↓
 * ┌──────────────────┐
 * │ ServiceWorker    │
 * │ Backend          │
 * │ - postMessage    │
 * │ - Background DL  │
 * └──────────────────┘
 *
 * Usage:
 *   const proxy = new CacheProxy();
 *   await proxy.init();  // Waits for SW to be ready
 *
 *   const blob = await proxy.getFile('media', '123');
 *   await proxy.requestDownload([{ id, type, path, md5 }]);
 *   const isCached = await proxy.isCached('layout', '456');
 */

import { EventEmitter, createLogger } from '@xiboplayer/utils';

const log = createLogger('CacheProxy');

/**
 * ServiceWorkerBackend - Uses Service Worker for downloads and caching
 */
class ServiceWorkerBackend extends EventEmitter {
  constructor() {
    super();
    this.controller = null;
    this.fetchReady = false;
    this.fetchReadyPromise = null;
    this.fetchReadyResolve = null;
  }

  async init() {
    // Create promise for fetch readiness (resolved when SW sends SW_READY)
    this.fetchReadyPromise = new Promise(resolve => {
      this.fetchReadyResolve = resolve;
    });

    // Listen for SW_READY message
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_READY') {
        log.info('Received SW_READY signal - fetch handler is ready');
        this.fetchReady = true;
        this.fetchReadyResolve();
      }
    });

    // Get the active Service Worker (don't require controller)
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();

      // Use active SW if it exists (controller not required!)
      if (registration && registration.active && registration.active.state === 'activated') {
        log.info('Using active Service Worker (controller not required)');
        this.controller = navigator.serviceWorker.controller || registration.active;

        // Request readiness signal from SW
        this.controller.postMessage({ type: 'PING' });

        log.info('Service Worker backend initialized, waiting for fetch readiness...');
        return;
      }

      // Fall back to waiting for ready
      await navigator.serviceWorker.ready;
      this.controller = navigator.serviceWorker.controller;

      if (!this.controller) {
        throw new Error('Service Worker not controlling page');
      }

      // Request readiness signal from SW
      this.controller.postMessage({ type: 'PING' });

      log.info('Service Worker backend initialized, waiting for fetch readiness...');
    } else {
      throw new Error('Service Worker not supported');
    }
  }

  /**
   * Get file from cache (via Service Worker)
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<Blob|null>}
   */
  async getFile(type, id) {
    // Wait for SW fetch handler to be ready (eliminates race condition)
    if (!this.fetchReady) {
      log.debug(`Waiting for SW fetch handler to be ready before fetching ${type}/${id}...`);
      await this.fetchReadyPromise;
      log.debug(`SW fetch handler ready, proceeding with fetch`);
    }

    // Service Worker serves files via fetch interception
    // Construct cache URL and fetch it
    const cacheUrl = `/player/pwa/cache/${type}/${id}`;

    log.debug(`getFile(${type}, ${id}) → fetching ${cacheUrl}`);
    log.debug(`About to call fetch()...`);

    try {
      log.debug(`Calling fetch(${cacheUrl})...`);
      const response = await fetch(cacheUrl);
      log.debug(`fetch returned, status:`, response.status, response.statusText);

      if (!response.ok) {
        log.debug(`Response not OK (${response.status}), returning null`);
        if (response.status === 404) {
          return null; // Not cached
        }
        throw new Error(`Failed to get file: ${response.status}`);
      }

      log.debug(`Response OK, getting blob...`);
      const blob = await response.blob();
      log.debug(`Got blob, size:`, blob.size);
      return blob;
    } catch (error) {
      log.error('getFile EXCEPTION:', error);
      log.error('Error name:', error.name);
      log.error('Error message:', error.message);
      return null;
    }
  }

  /**
   * Check if file exists in cache (supports both whole files and chunked storage)
   * Service Worker's CacheManager.fileExists() handles the logic internally
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<boolean>}
   */
  async hasFile(type, id) {
    // Wait for SW fetch handler to be ready
    if (!this.fetchReady) {
      await this.fetchReadyPromise;
    }

    const cacheUrl = `/player/pwa/cache/${type}/${id}`;

    try {
      // SW's handleRequest uses CacheManager.fileExists() internally
      // Returns 200 for both whole files and chunked files (via metadata check)
      const response = await fetch(cacheUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Request downloads from Service Worker (non-blocking)
   * @param {Array} files - Array of { id, type, path, md5 }
   * @returns {Promise<void>}
   */
  async requestDownload(files) {
    if (!this.controller) {
      throw new Error('Service Worker not available');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        const { success, error, enqueuedCount, activeCount, queuedCount } = event.data;
        if (success) {
          log.info('Download request acknowledged:', enqueuedCount, 'files');
          log.info('Queue state:', activeCount, 'active,', queuedCount, 'queued');
          resolve();
        } else {
          reject(new Error(error || 'Service Worker download failed'));
        }
      };

      this.controller.postMessage(
        {
          type: 'DOWNLOAD_FILES',
          data: { files }
        },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Check if file is cached
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<boolean>}
   */
  async isCached(type, id) {
    const cacheUrl = `/player/pwa/cache/${type}/${id}`;

    try {
      const response = await fetch(cacheUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// DirectCacheBackend removed - Service Worker only architecture

/**
 * CacheProxy - Service Worker only interface
 */
export class CacheProxy extends EventEmitter {
  constructor() {
    super();
    this.backend = null;
    this.backendType = 'service-worker';
  }

  /**
   * Initialize proxy - WAITS for Service Worker to be ready
   */
  async init() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported - PWA requires Service Worker');
    }

    log.debug('Checking Service Worker state...');
    log.debug('controller =', navigator.serviceWorker.controller);

    // Check if SW registration exists (better than checking controller)
    const registration = await navigator.serviceWorker.getRegistration();
    log.debug('registration =', registration);
    log.debug('active =', registration?.active);
    log.debug('installing =', registration?.installing);
    log.debug('waiting =', registration?.waiting);

    // FAST PATH: If active SW exists AND no new SW is installing, use it immediately
    if (registration && registration.active && !registration.installing && !registration.waiting) {
      log.info('Active Service Worker found (no updates pending)');
      log.debug('SW state =', registration.active.state);

      // If not controlling yet, give it a moment to claim page
      if (!navigator.serviceWorker.controller) {
        log.debug('Not controlling yet, waiting 200ms for claim...');
        await new Promise(resolve => setTimeout(resolve, 200));
        log.debug('After wait, controller =', navigator.serviceWorker.controller);
      }

      // Use the active SW (even if controller is still null - it will work)
      this.backend = new ServiceWorkerBackend();
      await this.backend.init();
      log.info('Service Worker backend ready (fast path)');
      return;
    }

    // If there's a new SW installing/waiting, wait for it instead of using old one
    if (registration && (registration.installing || registration.waiting)) {
      log.info('New Service Worker detected, waiting for it to activate...');
      log.debug('installing =', registration.installing?.state);
      log.debug('waiting =', registration.waiting?.state);
    }

    // SLOW PATH: No active SW, wait for registration (fresh install)
    log.info('No active Service Worker, waiting for registration...');

    // Wait with timeout
    const swReady = navigator.serviceWorker.ready;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Service Worker ready timeout after 10s')), 10000)
    );

    try {
      await Promise.race([swReady, timeout]);
      log.debug('Service Worker ready promise resolved');
    } catch (error) {
      log.error('Service Worker wait failed:', error);
      throw new Error('Service Worker not ready - please reload page');
    }

    // Wait for SW to claim page
    await new Promise(resolve => setTimeout(resolve, 100));
    log.debug('After claim wait, controller =', navigator.serviceWorker.controller);

    // Controller not required - we can use registration.active instead
    // This handles the case where SW is active but hasn't set controller yet (timing issue)
    this.backend = new ServiceWorkerBackend();
    await this.backend.init();
    log.info('Service Worker backend ready (slow path)');
  }

  /**
   * Get file from cache
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<Blob|null>}
   */
  async getFile(type, id) {
    if (!this.backend) {
      throw new Error('CacheProxy not initialized');
    }
    return await this.backend.getFile(type, id);
  }

  /**
   * Check if file exists in cache (for streaming - no blob creation)
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<boolean>}
   */
  async hasFile(type, id) {
    if (!this.backend) {
      throw new Error('CacheProxy not initialized');
    }
    return await this.backend.hasFile(type, id);
  }

  /**
   * Request file downloads
   * Service Worker: Non-blocking (downloads in background)
   * Direct cache: Blocking (downloads sequentially)
   *
   * @param {Array} files - Array of { id, type, path, md5 }
   * @returns {Promise<void>}
   */
  async requestDownload(files) {
    if (!this.backend) {
      throw new Error('CacheProxy not initialized');
    }
    return await this.backend.requestDownload(files);
  }

  /**
   * Check if file is cached
   * @param {string} type - 'media', 'layout', 'widget'
   * @param {string} id - File ID
   * @returns {Promise<boolean>}
   */
  async isCached(type, id) {
    if (!this.backend) {
      throw new Error('CacheProxy not initialized');
    }
    return await this.backend.isCached(type, id);
  }

  /**
   * Get backend type for debugging
   * @returns {string} 'service-worker' or 'direct'
   */
  getBackendType() {
    return this.backendType;
  }

  /**
   * Check if Service Worker is being used
   * @returns {boolean}
   */
  isUsingServiceWorker() {
    return this.backendType === 'service-worker';
  }

  /**
   * Get download progress from Service Worker
   * @returns {Promise<Object>} Progress info for all active downloads
   */
  async getDownloadProgress() {
    if (!this.backend) {
      throw new Error('CacheProxy not initialized');
    }

    return new Promise((resolve) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        const { success, progress } = event.data;
        resolve(success ? progress : {});
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_DOWNLOAD_PROGRESS' },
        [channel.port2]
      );

      // Timeout after 1 second
      setTimeout(() => resolve({}), 1000);
    });
  }
}
