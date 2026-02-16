/**
 * CacheProxy Tests
 *
 * Contract-based testing for CacheProxy and ServiceWorkerBackend
 * Service Worker only architecture - no fallback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheProxy } from './cache-proxy.js';
import { createTestBlob } from './test-utils.js';

// The source computes BASE from window.location.pathname.
// In jsdom the default pathname is '/' which resolves to '/player/pwa'.
const BASE = '/player/pwa';

/**
 * Helper: set up navigator.serviceWorker mock.
 *
 * Options:
 *   supported   – whether 'serviceWorker' exists on navigator (default true)
 *   controller  – the SW controller object (or null)
 *   active      – the active ServiceWorker object (derived from controller if omitted)
 *   installing  – registration.installing value (default null)
 *   waiting     – registration.waiting value (default null)
 *   registration – override the full registration object
 *   swReadyResolves – whether navigator.serviceWorker.ready resolves (default true)
 */
function setupServiceWorker(opts = {}) {
  const {
    supported = true,
    controller = null,
    active = undefined,
    installing = null,
    waiting = null,
    swReadyResolves = true,
  } = opts;

  if (!supported) {
    // Must delete entirely so that ('serviceWorker' in navigator) is false.
    // First make the property configurable if it isn't already, then delete.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    delete navigator.serviceWorker;
    return;
  }

  const activeSW = active !== undefined
    ? active
    : controller
      ? { state: 'activated', postMessage: controller.postMessage }
      : null;

  const registration = {
    active: activeSW,
    installing,
    waiting,
  };

  const messageListeners = [];

  const swContainer = {
    controller,
    ready: swReadyResolves
      ? Promise.resolve(registration)
      : new Promise(() => {}),  // never resolves
    getRegistration: vi.fn().mockResolvedValue(registration),
    addEventListener: vi.fn((event, handler) => {
      if (event === 'message') {
        messageListeners.push(handler);
      }
    }),
    removeEventListener: vi.fn(),
  };

  // Expose the message listeners so tests can dispatch SW_READY
  swContainer._messageListeners = messageListeners;
  // Also expose registration for manipulation
  swContainer._registration = registration;

  Object.defineProperty(navigator, 'serviceWorker', {
    value: swContainer,
    configurable: true,
    writable: true,
  });

  return swContainer;
}

/**
 * Dispatch a simulated message event to all registered SW message listeners
 */
function dispatchSWMessage(swContainer, data) {
  for (const listener of swContainer._messageListeners || []) {
    listener({ data });
  }
}

/**
 * Set up a mock MessageChannel (needed by requestDownload / prioritizeDownload).
 * Returns a factory that captures ports so tests can simulate SW responses.
 */
function setupMessageChannel() {
  // Each call to new MessageChannel() produces a linked pair.
  // The implementation sends on port2 (transferred to SW), listens on port1.
  // We capture the pair so the test can push a response into port1.onmessage.
  const channels = [];

  global.MessageChannel = class {
    constructor() {
      const self = { port1: { onmessage: null }, port2: {} };
      channels.push(self);
      this.port1 = self.port1;
      this.port2 = self.port2;
    }
  };

  return {
    /** The most recently created channel */
    get lastChannel() {
      return channels[channels.length - 1];
    },
    /** Simulate SW replying through the channel */
    respondOnLastChannel(data) {
      const ch = channels[channels.length - 1];
      if (ch && ch.port1.onmessage) {
        ch.port1.onmessage({ data });
      }
    },
    channels,
  };
}

/**
 * Reset navigator.serviceWorker and global.fetch between tests
 */
function resetMocks() {
  // Restore a bare serviceWorker so the next setupServiceWorker can override it
  Object.defineProperty(navigator, 'serviceWorker', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  global.fetch = vi.fn();
  delete global.MessageChannel;
}

// ---------------------------------------------------------------------------
// Helper to create a fully initialised CacheProxy for the common "happy path"
// where SW is active and ready.  Sends SW_READY so the fetchReadyPromise inside
// ServiceWorkerBackend resolves, allowing getFile / hasFile / isCached to work.
// ---------------------------------------------------------------------------
async function createInitialisedProxy() {
  const controller = { postMessage: vi.fn() };
  const sw = setupServiceWorker({ controller });

  const proxy = new CacheProxy();
  const initPromise = proxy.init();

  // The backend's init() sets up a message listener then posts PING.
  // We need to simulate the SW_READY response.
  // Give init a microtask to register the listener, then fire SW_READY.
  await Promise.resolve(); // let init() progress
  dispatchSWMessage(sw, { type: 'SW_READY' });

  await initPromise;
  return { proxy, sw, controller };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('CacheProxy', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('Service Worker Requirement', () => {
    it('should require Service Worker to be available', async () => {
      setupServiceWorker({ supported: false });

      const proxy = new CacheProxy();

      await expect(proxy.init()).rejects.toThrow('Service Worker not supported');
    });

    it('should wait for Service Worker to be ready and controlling', async () => {
      const { proxy } = await createInitialisedProxy();

      expect(proxy.backendType).toBe('service-worker');
      expect(proxy.backend).toBeTruthy();
    });

    it('should throw if Service Worker not controlling after ready', async () => {
      // Provide a registration with no active SW and no controller.
      // The slow path waits for ready, then ServiceWorkerBackend.init() will
      // call getRegistration() which returns { active: null }, so it falls
      // through to the ready path where controller is null -> throws.
      const sw = setupServiceWorker({
        controller: null,
        active: null,
      });

      const proxy = new CacheProxy();

      await expect(proxy.init()).rejects.toThrow('Service Worker not controlling page');
    });
  });

  describe('Pre-condition: initialization required', () => {
    it('should throw if getFile() called before init()', async () => {
      const proxy = new CacheProxy();

      await expect(proxy.getFile('media', '123')).rejects.toThrow('CacheProxy not initialized');
    });

    it('should throw if requestDownload() called before init()', async () => {
      const proxy = new CacheProxy();

      await expect(proxy.requestDownload([])).rejects.toThrow('CacheProxy not initialized');
    });

    it('should throw if isCached() called before init()', async () => {
      const proxy = new CacheProxy();

      await expect(proxy.isCached('media', '123')).rejects.toThrow('CacheProxy not initialized');
    });
  });
});

describe('ServiceWorkerBackend', () => {
  beforeEach(() => {
    resetMocks();
    setupMessageChannel();
  });

  describe('init()', () => {
    it('should initialize with SW controller', async () => {
      const { proxy } = await createInitialisedProxy();

      expect(proxy.backendType).toBe('service-worker');
    });

    it('should throw if SW not supported', async () => {
      setupServiceWorker({ supported: false });

      const proxy = new CacheProxy();

      await expect(proxy.init()).rejects.toThrow('Service Worker not supported');
    });

    it('should throw if SW not controlling page', async () => {
      setupServiceWorker({ controller: null, active: null });

      const proxy = new CacheProxy();

      await expect(proxy.init()).rejects.toThrow('Service Worker not controlling page');
    });
  });

  describe('getFile()', () => {
    it('should fetch from cache URL with correct BASE path', async () => {
      const { proxy } = await createInitialisedProxy();

      const testBlob = createTestBlob(1024);
      global.fetch = vi.fn((url) => {
        if (url === `${BASE}/cache/media/123`) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: () => Promise.resolve(testBlob),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const blob = await proxy.getFile('media', '123');

      expect(blob).toBe(testBlob);
      expect(global.fetch).toHaveBeenCalledWith(`${BASE}/cache/media/123`);
    });

    it('should return null for 404', async () => {
      const { proxy } = await createInitialisedProxy();

      global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

      const blob = await proxy.getFile('media', '123');

      expect(blob).toBeNull();
    });

    it('should return null on fetch error', async () => {
      const { proxy } = await createInitialisedProxy();

      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      const blob = await proxy.getFile('media', '123');

      expect(blob).toBeNull();
    });
  });

  describe('requestDownload()', () => {
    it('should post DOWNLOAD_FILES message to SW', async () => {
      const { proxy } = await createInitialisedProxy();

      const files = [
        { id: '1', type: 'media', path: 'http://test.com/file1.mp4', md5: 'abc123' },
        { id: '2', type: 'media', path: 'http://test.com/file2.mp4', md5: 'def456' },
      ];

      // Mock the backend method to verify call signature
      proxy.backend.requestDownload = vi.fn().mockResolvedValue();

      await proxy.requestDownload(files);

      expect(proxy.backend.requestDownload).toHaveBeenCalledWith(files);
    });

    it('should resolve when SW acknowledges', async () => {
      const { proxy } = await createInitialisedProxy();

      proxy.backend.requestDownload = vi.fn().mockResolvedValue();

      const files = [{ id: '1', type: 'media', path: 'http://test.com/file.mp4' }];

      await expect(proxy.requestDownload(files)).resolves.toBeUndefined();
    });

    it('should reject when SW returns error', async () => {
      const { proxy } = await createInitialisedProxy();

      proxy.backend.requestDownload = vi.fn().mockRejectedValue(new Error('Download failed'));

      const files = [{ id: '1', type: 'media', path: 'http://test.com/file.mp4' }];

      await expect(proxy.requestDownload(files)).rejects.toThrow('Download failed');
    });

    it('should throw if SW controller not available', async () => {
      const { proxy } = await createInitialisedProxy();

      // Simulate controller becoming null after init
      proxy.backend.controller = null;

      await expect(proxy.requestDownload([])).rejects.toThrow('Service Worker not available');
    });
  });

  describe('isCached()', () => {
    it('should perform HEAD request to check if cached', async () => {
      const { proxy } = await createInitialisedProxy();

      global.fetch = vi.fn((url, options) => {
        if (url === `${BASE}/cache/media/123` && options?.method === 'HEAD') {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const cached = await proxy.isCached('media', '123');

      expect(cached).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(`${BASE}/cache/media/123`, { method: 'HEAD' });
    });

    it('should return false for 404', async () => {
      const { proxy } = await createInitialisedProxy();

      global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

      const cached = await proxy.isCached('media', '123');

      expect(cached).toBe(false);
    });

    it('should return false on fetch error', async () => {
      const { proxy } = await createInitialisedProxy();

      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      const cached = await proxy.isCached('media', '123');

      expect(cached).toBe(false);
    });
  });
});
