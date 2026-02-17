/**
 * Cache Manager Tests
 *
 * Tests for file caching with Cache API + IndexedDB
 * Including large file downloads with parallel chunking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from './cache.js';

describe('CacheManager', () => {
  let manager;
  let mockCache;
  let mockDB;
  let mockIndexedDB;

  beforeEach(async () => {
    // Mock Cache API — stores raw text/blob and headers as plain objects
    mockCache = {
      _storage: new Map(),
      async match(key) {
        const keyStr = typeof key === 'string' ? key : key.toString();
        const entry = this._storage.get(keyStr);
        if (!entry) return undefined;

        // Reconstruct a real Response from stored data
        return new Response(entry.body, {
          headers: entry.headers
        });
      },
      async put(key, response) {
        const keyStr = typeof key === 'string' ? key : key.toString();
        // Read the body as text (preserves strings) and store headers as plain object
        const bodyText = await response.text();
        const headers = {};
        response.headers.forEach((value, name) => {
          headers[name] = value;
        });
        this._storage.set(keyStr, { body: bodyText, headers });
      },
      async delete(key) {
        const keyStr = typeof key === 'string' ? key : key.toString();
        return this._storage.delete(keyStr);
      }
    };

    // Setup global mocks
    global.caches = {
      async open() {
        return mockCache;
      },
      async delete() {
        mockCache._storage.clear();
      }
    };

    // Use real fake-indexeddb (provided by vitest.setup.js)
    // Clean the database between tests to avoid data leaking
    const deleteRequest = indexedDB.deleteDatabase('xibo-player');
    await new Promise((resolve) => {
      deleteRequest.onsuccess = resolve;
      deleteRequest.onerror = resolve;
      deleteRequest.onblocked = resolve;
    });

    // Mock @xiboplayer/utils config
    vi.mock('@xiboplayer/utils', () => ({
      config: {
        cmsAddress: 'https://test.cms.com'
      }
    }));

    // Mock fetch
    global.fetch = vi.fn();

    // Mock window events
    global.window = {
      dispatchEvent: vi.fn(),
      location: {
        origin: 'https://test.cms.com',
        pathname: '/player/pwa/index.html'
      }
    };

    // Mock navigator.serviceWorker
    global.navigator = {
      serviceWorker: {
        controller: null
      }
    };

    manager = new CacheManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Close any open DB connections to allow deleteDatabase in next beforeEach
    if (manager && manager.db) {
      manager.db.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize cache and database', async () => {
      await manager.init();

      expect(manager.cache).toBeDefined();
      expect(manager.db).toBeDefined();
    });
  });

  describe('extractFilename()', () => {
    it('should extract filename from URL query parameter', () => {
      const filename = manager.extractFilename('https://test.com/xmds.php?file=image.jpg&key=123');

      expect(filename).toBe('image.jpg');
    });

    it('should return "unknown" for invalid URL', () => {
      const filename = manager.extractFilename('not-a-url');

      expect(filename).toBe('unknown');
    });

    it('should return "unknown" when file parameter missing', () => {
      const filename = manager.extractFilename('https://test.com/xmds.php?other=param');

      expect(filename).toBe('unknown');
    });
  });

  describe('rewriteUrl()', () => {
    it('should rewrite URL to use configured CMS address', () => {
      const rewritten = manager.rewriteUrl('https://different.com/path?file=test.jpg');

      expect(rewritten).toContain('test.cms.com');
    });

    it('should not rewrite URL if same origin', () => {
      const original = 'https://test.cms.com/path?file=test.jpg';
      const rewritten = manager.rewriteUrl(original);

      expect(rewritten).toBe(original);
    });

    it('should return URL as-is if invalid', () => {
      const invalid = 'not-a-url';
      const rewritten = manager.rewriteUrl(invalid);

      expect(rewritten).toBe(invalid);
    });

    it('should handle null/undefined URLs', () => {
      expect(manager.rewriteUrl(null)).toBeNull();
      expect(manager.rewriteUrl(undefined)).toBeUndefined();
    });
  });

  describe('getCacheKey()', () => {
    it('should generate cache key with type and id', () => {
      const key = manager.getCacheKey('media', '123');

      expect(key).toBe('/player/pwa/cache/media/123');
    });

    it('should use filename if provided', () => {
      const key = manager.getCacheKey('media', '123', 'image.jpg');

      expect(key).toBe('/player/pwa/cache/media/image.jpg');
    });

    it('should handle layout type', () => {
      const key = manager.getCacheKey('layout', '100');

      expect(key).toBe('/player/pwa/cache/layout/100');
    });
  });

  describe('File Record Management', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should save file record', async () => {
      const record = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.mp4',
        md5: 'abc123',
        size: 1024,
        cachedAt: Date.now()
      };

      await manager.saveFile(record);
      const retrieved = await manager.getFile('1');

      expect(retrieved).toEqual(record);
    });

    it('should get all files', async () => {
      await manager.saveFile({ id: '1', type: 'media' });
      await manager.saveFile({ id: '2', type: 'layout' });

      const files = await manager.getAllFiles();

      expect(files).toHaveLength(2);
    });

    it('should return undefined for non-existent file', async () => {
      const file = await manager.getFile('non-existent');

      expect(file).toBeUndefined();
    });
  });

  describe('downloadFile() - Small Files', () => {
    beforeEach(async () => {
      await manager.init();

      // Helper: create a mock blob with arrayBuffer()/stream() support
      function createMockBlob(content, type) {
        const blob = new Blob([content], { type });
        // Polyfill arrayBuffer() for jsdom environments that lack it
        if (!blob.arrayBuffer) {
          blob.arrayBuffer = async () => {
            const reader = new FileReader();
            return new Promise((resolve) => {
              reader.onload = () => resolve(reader.result);
              reader.readAsArrayBuffer(blob);
            });
          };
        }
        // Polyfill stream() for jsdom environments that lack it
        if (!blob.stream) {
          blob.stream = () => new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(content));
              controller.close();
            }
          });
        }
        return blob;
      }

      // Mock successful download
      global.fetch.mockImplementation(async (url, options) => {
        if (options?.method === 'HEAD') {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name) => name === 'Content-Length' ? '1024' : null
            }
          };
        }

        const blob = createMockBlob('test data', 'image/jpeg');
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) => name === 'Content-Type' ? 'image/jpeg' : null
          },
          blob: async () => blob
        };
      });

      // Mock SparkMD5
      vi.mock('spark-md5', () => ({
        default: {
          ArrayBuffer: {
            hash: () => 'abc123'
          }
        }
      }));
    });

    it('should download and cache file', async () => {
      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'abc123',
        download: 'http'
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result).toMatchObject({
        id: '1',
        type: 'media',
        md5: 'abc123'
      });
    });

    it('should skip download if already cached with matching MD5', async () => {
      // Pre-cache file
      await manager.saveFile({
        id: '1',
        type: 'media',
        md5: 'abc123',
        path: 'http://test.com/file.jpg',
        size: 1024,
        cachedAt: Date.now()
      });

      // Use content >= 100 bytes to avoid "tiny file" corruption check
      const largeContent = 'x'.repeat(200);
      const cacheKey = manager.getCacheKey('media', '1');
      await mockCache.put(cacheKey, new Response(largeContent, {
        headers: { 'Content-Type': 'image/jpeg' }
      }));

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'abc123'
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result.md5).toBe('abc123');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should re-download if MD5 mismatch', async () => {
      // Pre-cache file with different MD5
      await manager.saveFile({
        id: '1',
        type: 'media',
        md5: 'old-md5',
        path: 'http://test.com/file.jpg',
        size: 1024,
        cachedAt: Date.now()
      });

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'new-md5'
      };

      await manager.downloadFile(fileInfo);

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should skip files with no download URL', async () => {
      const fileInfo = {
        id: '1',
        type: 'resource',
        path: null
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle HTTP errors', async () => {
      global.fetch.mockImplementation(async (url, options) => {
        if (options?.method === 'HEAD') {
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => name === 'Content-Length' ? '1024' : null }
          };
        }
        // GET download returns error
        return {
          ok: false,
          status: 404,
          headers: { get: () => null }
        };
      });

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg'
      };

      await expect(manager.downloadFile(fileInfo)).rejects.toThrow('Failed to download');
    });

    it('should delete corrupted cache (text/plain responses)', async () => {
      // Pre-cache corrupted file
      await manager.saveFile({
        id: '1',
        type: 'media',
        md5: 'abc123',
        path: 'http://test.com/file.jpg',
        size: 50,
        cachedAt: Date.now()
      });

      const cacheKey = manager.getCacheKey('media', '1');
      await mockCache.put(cacheKey, new Response(new Blob(['error']), {
        headers: { 'Content-Type': 'text/plain' }
      }));

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'abc123'
      };

      await manager.downloadFile(fileInfo);

      // Should re-download
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle Service Worker active (skip download)', async () => {
      global.navigator.serviceWorker.controller = {}; // SW active

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'abc123'
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result.isServiceWorkerDownload).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();

      global.navigator.serviceWorker.controller = null; // Reset
    });

    it('should handle HTTP 202 (background download pending)', async () => {
      // HEAD request returns 202 (background download in progress)
      global.fetch.mockImplementation(async (url, options) => {
        return {
          ok: true,
          status: 202,
          headers: { get: () => null }
        };
      });

      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/file.jpg',
        md5: 'abc123'
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result.isPending).toBe(true);
    });
  });

  describe('downloadFile() - Large Files', () => {
    beforeEach(async () => {
      await manager.init();

      // Mock large file (>100MB)
      global.fetch.mockImplementation(async (url, options) => {
        if (options?.method === 'HEAD') {
          return {
            ok: true,
            headers: {
              get: (name) => name === 'Content-Length' ? '200000000' : null // 200 MB
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) => name === 'Content-Type' ? 'video/mp4' : null
          },
          blob: async () => new Blob(['chunk data'])
        };
      });
    });

    it('should start background download for large files', async () => {
      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/large-video.mp4',
        md5: 'abc123'
      };

      const result = await manager.downloadFile(fileInfo);

      expect(result.isBackgroundDownload).toBe(true);
      expect(result.size).toBe(200000000);
    });

    it('should return immediately for large files (non-blocking)', async () => {
      const fileInfo = {
        id: '1',
        type: 'media',
        path: 'http://test.com/large-video.mp4',
        md5: 'abc123'
      };

      const startTime = Date.now();
      await manager.downloadFile(fileInfo);
      const duration = Date.now() - startTime;

      // Should return in <100ms (not wait for download)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('getCachedFile()', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should retrieve cached file as blob', async () => {
      const cacheKey = manager.getCacheKey('media', '1');
      const blob = new Blob(['test data']);
      await mockCache.put(cacheKey, new Response(blob));

      const retrieved = await manager.getCachedFile('media', '1');

      expect(retrieved).toBeTruthy();
      expect(retrieved.size).toBeGreaterThan(0);
    });

    it('should return null for non-cached file', async () => {
      const retrieved = await manager.getCachedFile('media', 'non-existent');

      expect(retrieved).toBeNull();
    });
  });

  describe('getCachedResponse()', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should retrieve cached response with headers', async () => {
      const cacheKey = manager.getCacheKey('media', '1');
      await mockCache.put(cacheKey, new Response(new Blob(['data']), {
        headers: { 'Content-Type': 'image/jpeg' }
      }));

      const response = await manager.getCachedResponse('media', '1');

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    });
  });

  describe('getCachedFileText()', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should retrieve cached file as text', async () => {
      const cacheKey = manager.getCacheKey('layout', '100');
      await mockCache.put(cacheKey, new Response('layout XML'));

      const text = await manager.getCachedFileText('layout', '100');

      expect(text).toBe('layout XML');
    });
  });

  describe('cacheWidgetHtml()', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should cache widget HTML with base tag injection', async () => {
      const html = '<html><head><title>Widget</title></head><body>Content</body></html>';

      const cacheKey = await manager.cacheWidgetHtml('100', '1', '2', html);

      expect(cacheKey).toBe('/player/pwa/cache/widget/100/1/2');

      // Verify base tag was injected
      const cached = await mockCache.match(new URL(cacheKey, 'https://test.cms.com'));
      const cachedHtml = await cached.text();

      expect(cachedHtml).toContain('<base href="/player/cache/media/">');
    });

    it('should inject base tag after <head> tag', async () => {
      const html = '<html><head><title>Test</title></head></html>';

      await manager.cacheWidgetHtml('100', '1', '2', html);

      const cacheKey = '/player/pwa/cache/widget/100/1/2';
      const cached = await mockCache.match(new URL(cacheKey, 'https://test.cms.com'));
      const cachedHtml = await cached.text();

      expect(cachedHtml).toMatch(/<head><base href="\/player\/cache\/media\/">/);
    });

    it('should prepend base tag if no <head> tag', async () => {
      const html = '<div>Widget content</div>';

      await manager.cacheWidgetHtml('100', '1', '2', html);

      const cacheKey = '/player/pwa/cache/widget/100/1/2';
      const cached = await mockCache.match(new URL(cacheKey, 'https://test.cms.com'));
      const cachedHtml = await cached.text();

      expect(cachedHtml).toMatch(/^<base href="\/player\/cache\/media\/">/);
    });
  });

  describe('clearAll()', () => {
    beforeEach(async () => {
      await manager.init();

      // Add some cached data
      await manager.saveFile({ id: '1', type: 'media' });
      await manager.saveFile({ id: '2', type: 'layout' });
      const cacheKey = manager.getCacheKey('media', '1');
      await mockCache.put(cacheKey, new Response('data'));
    });

    it('should clear all caches and IndexedDB', async () => {
      await manager.clearAll();

      const files = await manager.getAllFiles();
      expect(files).toHaveLength(0);

      const cached = await manager.getCachedFile('media', '1');
      expect(cached).toBeNull();
    });
  });

  describe('Dependant Tracking', () => {
    it('should add a dependant mapping from media to layout', () => {
      manager.addDependant('media1', 'layout1');

      expect(manager.isMediaReferenced('media1')).toBe(true);
    });

    it('should track multiple layouts for same media', () => {
      manager.addDependant('media1', 'layout1');
      manager.addDependant('media1', 'layout2');

      expect(manager.isMediaReferenced('media1')).toBe(true);
    });

    it('should track multiple media for different layouts', () => {
      manager.addDependant('media1', 'layout1');
      manager.addDependant('media2', 'layout1');
      manager.addDependant('media3', 'layout2');

      expect(manager.isMediaReferenced('media1')).toBe(true);
      expect(manager.isMediaReferenced('media2')).toBe(true);
      expect(manager.isMediaReferenced('media3')).toBe(true);
    });

    it('should return false for unreferenced media', () => {
      expect(manager.isMediaReferenced('nonexistent')).toBe(false);
    });

    it('should handle numeric IDs by converting to strings', () => {
      manager.addDependant(42, 100);

      expect(manager.isMediaReferenced(42)).toBe(true);
      expect(manager.isMediaReferenced('42')).toBe(true);
    });

    it('should remove layout dependants and return orphaned media', () => {
      manager.addDependant('media1', 'layout1');
      manager.addDependant('media2', 'layout1');
      manager.addDependant('media3', 'layout1');
      manager.addDependant('media3', 'layout2'); // media3 is shared

      const orphaned = manager.removeLayoutDependants('layout1');

      // media1 and media2 are orphaned (only referenced by layout1)
      expect(orphaned).toContain('media1');
      expect(orphaned).toContain('media2');
      // media3 is NOT orphaned (still referenced by layout2)
      expect(orphaned).not.toContain('media3');
      expect(manager.isMediaReferenced('media3')).toBe(true);
    });

    it('should return empty array when layout has no dependants', () => {
      const orphaned = manager.removeLayoutDependants('nonexistent');

      expect(orphaned).toEqual([]);
    });

    it('should remove media from dependants map when orphaned', () => {
      manager.addDependant('media1', 'layout1');

      const orphaned = manager.removeLayoutDependants('layout1');

      expect(orphaned).toContain('media1');
      expect(manager.isMediaReferenced('media1')).toBe(false);
    });

    it('should not affect other layouts when removing one', () => {
      manager.addDependant('media1', 'layout1');
      manager.addDependant('media2', 'layout2');

      manager.removeLayoutDependants('layout1');

      expect(manager.isMediaReferenced('media1')).toBe(false);
      expect(manager.isMediaReferenced('media2')).toBe(true);
    });

    it('should handle removing same layout twice', () => {
      manager.addDependant('media1', 'layout1');

      const orphaned1 = manager.removeLayoutDependants('layout1');
      const orphaned2 = manager.removeLayoutDependants('layout1');

      expect(orphaned1).toContain('media1');
      expect(orphaned2).toEqual([]);
    });
  });

  describe('Download Progress Events', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should dispatch download-progress events', () => {
      manager.notifyDownloadProgress('test.mp4', 512, 1024);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'download-progress',
          detail: expect.objectContaining({
            filename: 'test.mp4',
            loaded: 512,
            total: 1024,
            percent: 50
          })
        })
      );
    });

    it('should mark download as complete', () => {
      manager.notifyDownloadProgress('test.mp4', 1024, 1024, true);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            complete: true
          })
        })
      );
    });

    it('should mark download as error', () => {
      manager.notifyDownloadProgress('test.mp4', 512, 1024, false, true);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            error: true
          })
        })
      );
    });
  });
});
