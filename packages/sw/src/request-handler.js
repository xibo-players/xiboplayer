/**
 * RequestHandler - Handles fetch events for cached media
 *
 * Routes media/layout/widget requests to the proxy's /media-cache endpoint,
 * which serves files from the durable DiskCache (filesystem).
 * The SW no longer reads from Cache API for media content.
 *
 * Static files (HTML pages, widget bundles, fonts) are still served from
 * Cache API via the static cache.
 */

import { BASE } from './sw-utils.js';
import { SWLogger } from './chunk-config.js';

export class RequestHandler {
  /**
   * @param {Object} downloadManager - DownloadManager instance
   * @param {Object} [options]
   * @param {string} [options.staticCache='xibo-static-v1'] - Static cache name
   */
  constructor(downloadManager, { staticCache = 'xibo-static-v1' } = {}) {
    this.downloadManager = downloadManager;
    this.staticCache = staticCache;
    this.pendingFetches = new Map(); // filename → Promise<Response> for deduplication
    this.log = new SWLogger('SW');
  }

  /**
   * Handle fetch request
   * - Route media to proxy /media-cache
   * - Serve static files from Cache API
   * - Wait for download if in progress
   * - Return 404 if not cached and not downloading
   */
  async handleRequest(event) {
    const url = new URL(event.request.url);
    this.log.info('handleRequest called for:', url.href);

    // Handle static files (player pages)
    if (url.pathname === BASE + '/' ||
        url.pathname === BASE + '/index.html' ||
        url.pathname === BASE + '/setup.html') {
      const cache = await caches.open(this.staticCache);
      const cached = await cache.match(event.request);
      if (cached) {
        this.log.info('Serving static file from cache:', url.pathname);
        return cached;
      }
      this.log.info('Fetching static file from network:', url.pathname);
      return fetch(event.request);
    }

    // Handle widget resources (bundle.min.js, fonts)
    if ((url.pathname.includes('xmds.php') || url.pathname.includes('pwa/file')) &&
        (url.searchParams.get('fileType') === 'bundle' ||
         url.searchParams.get('fileType') === 'fontCss' ||
         url.searchParams.get('fileType') === 'font')) {
      return this._handleWidgetResource(event, url);
    }

    // Handle XMDS media requests (XLR compatibility + PWA file downloads)
    if ((url.pathname.includes('xmds.php') || url.pathname.includes('pwa/file')) && url.searchParams.has('file')) {
      const filename = url.searchParams.get('file');
      const fileId = filename.split('.')[0];
      const fileType = url.searchParams.get('type');
      const cacheType = fileType === 'L' ? 'layout' : 'media';

      this.log.info('XMDS request:', filename, 'type:', fileType, '→ /media-cache/' + cacheType + '/' + fileId);

      // Route to proxy's DiskCache
      const proxyUrl = `/media-cache/${cacheType}/${fileId}`;
      try {
        const proxyResp = await fetch(proxyUrl);
        if (proxyResp.ok) {
          return new Response(proxyResp.body, {
            headers: {
              'Content-Type': proxyResp.headers.get('Content-Type') || 'video/mp4',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=31536000',
              'Accept-Ranges': 'bytes'
            }
          });
        }
      } catch (_) {}

      // Not cached - pass through to CMS
      this.log.info('XMDS file not cached, passing through:', filename);
      return fetch(event.request);
    }

    // Handle static widget resources (rewritten URLs from widget HTML)
    if (url.pathname.startsWith(BASE + '/cache/static/')) {
      return this._handleStaticResource(url);
    }

    // Only handle /player/pwa/cache/* requests below
    if (!url.pathname.startsWith(BASE + '/cache/')) {
      this.log.info('NOT a cache request, returning null:', url.pathname);
      return null; // Let browser handle
    }

    this.log.info('Cache request:', url.pathname);

    // Handle widget HTML requests — still from DiskCache via proxy
    if (url.pathname.startsWith(BASE + '/cache/widget/')) {
      return this._handleWidgetHtml(url);
    }

    // Extract cache key and route to proxy
    const cacheKey = url.pathname.replace(/\.json$/, '');
    const method = event.request.method;
    const rangeHeader = event.request.headers.get('Range');

    if (rangeHeader) {
      this.log.info(method, cacheKey, `Range: ${rangeHeader}`);
    } else {
      this.log.info(method, cacheKey);
    }

    // Convert /player/pwa/cache/media/123 → /media-cache/media/123
    const parts = cacheKey.replace(BASE + '/cache/', '').split('/');
    const proxyUrl = `/media-cache/${parts.join('/')}`;

    // Route to proxy
    try {
      const fetchOpts = { method };
      if (rangeHeader) {
        fetchOpts.headers = { Range: rangeHeader };
      }

      const proxyResp = await fetch(proxyUrl, fetchOpts);

      if (proxyResp.ok || proxyResp.status === 206) {
        return proxyResp;
      }

      // 404 from proxy — file not on disk yet
      if (proxyResp.status === 404) {
        return this._handleNotCached(cacheKey, event, method, rangeHeader);
      }

      return proxyResp;
    } catch (err) {
      this.log.error('Proxy fetch error:', err.message);
      return this._handleNotCached(cacheKey, event, method, rangeHeader);
    }
  }

  /**
   * Handle file not yet on disk — check if download is in progress
   */
  async _handleNotCached(cacheKey, event, method, rangeHeader) {
    const keyParts = cacheKey.split('/');
    const type = keyParts[keyParts.length - 2];
    const id = keyParts[keyParts.length - 1];

    // Check if download is in progress
    let task = null;
    for (const [, activeTask] of this.downloadManager.queue.active.entries()) {
      if (activeTask.fileInfo.type === type && String(activeTask.fileInfo.id) === id) {
        task = activeTask;
        break;
      }
    }

    if (task) {
      this.log.info('Download in progress, waiting:', cacheKey);
      try {
        await task.wait();

        // After download, proxy should have the file now — retry
        const parts = cacheKey.replace(BASE + '/cache/', '').split('/');
        const proxyUrl = `/media-cache/${parts.join('/')}`;
        const fetchOpts = { method };
        if (rangeHeader) fetchOpts.headers = { Range: rangeHeader };

        const retryResp = await fetch(proxyUrl, fetchOpts);
        if (retryResp.ok || retryResp.status === 206) {
          this.log.info('Download complete, serving from proxy:', cacheKey);
          return retryResp;
        }
      } catch (error) {
        this.log.error('Download failed:', cacheKey, error);
        return new Response('Download failed: ' + error.message, { status: 500 });
      }
    }

    this.log.info('Not found:', cacheKey);
    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle widget resources (bundle.min.js, fonts) — static cache
   */
  async _handleWidgetResource(event, url) {
    const filename = url.searchParams.get('file');
    const cacheKey = `${BASE}/cache/static/${filename}`;
    const cache = await caches.open(this.staticCache);

    const cached = await cache.match(cacheKey);
    if (cached) {
      this.log.info('Serving widget resource from cache:', filename);
      return cached.clone();
    }

    if (this.pendingFetches.has(filename)) {
      this.log.info('Deduplicating widget resource fetch:', filename);
      const pending = await this.pendingFetches.get(filename);
      return pending.clone();
    }

    this.log.info('Fetching widget resource from CMS:', filename);
    const fetchPromise = (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          this.log.info('Caching widget resource:', filename, `(${response.headers.get('Content-Type')})`);
          const responseClone = response.clone();
          await cache.put(cacheKey, responseClone);
          return response;
        } else {
          this.log.warn('Widget resource not available (', response.status, '):', filename, '- NOT caching');
          return response;
        }
      } catch (error) {
        this.log.error('Failed to fetch widget resource:', filename, error);
        return new Response('Failed to fetch widget resource', {
          status: 502, statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })();

    this.pendingFetches.set(filename, fetchPromise);
    try {
      const response = await fetchPromise;
      return response.clone();
    } finally {
      this.pendingFetches.delete(filename);
    }
  }

  /**
   * Handle static resources (rewritten URLs from widget HTML)
   */
  async _handleStaticResource(url) {
    const filename = url.pathname.split('/').pop();
    this.log.info('Static resource request:', filename);

    const staticCache = await caches.open(this.staticCache);
    const staticCached = await staticCache.match(`${BASE}/cache/static/${filename}`);
    if (staticCached) {
      this.log.info('Serving static resource from static cache:', filename);
      return staticCached.clone();
    }

    // Try DiskCache via proxy (dual-cached from download manager)
    try {
      const proxyResp = await fetch(`/media-cache/static/${filename}`);
      if (proxyResp.ok) {
        this.log.info('Serving static resource from DiskCache:', filename);
        return proxyResp;
      }
    } catch (_) {}

    this.log.warn('Static resource not cached:', filename);
    return new Response('Resource not cached', { status: 404 });
  }

  /**
   * Handle widget HTML requests — route to proxy DiskCache
   */
  async _handleWidgetHtml(url) {
    this.log.info('Widget HTML request:', url.pathname);
    const parts = url.pathname.replace(BASE + '/cache/', '').split('/');
    const proxyUrl = `/media-cache/${parts.join('/')}`;

    try {
      const proxyResp = await fetch(proxyUrl);
      if (proxyResp.ok) {
        return new Response(proxyResp.body, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=31536000'
          }
        });
      }
    } catch (_) {}

    return new Response('<!DOCTYPE html><html><body>Widget not found</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}
