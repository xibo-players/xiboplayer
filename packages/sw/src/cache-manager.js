/**
 * CacheManager - Thin wrapper around Cache API for static resources only
 *
 * Media, layouts, and widgets are stored on disk via DiskCache (proxy).
 * This class only manages the static Cache API (widget bundles, fonts, HTML).
 */

import { SWLogger } from './chunk-config.js';

export class CacheManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheName='xibo-static-v1'] - Cache Storage name
   */
  constructor({ cacheName = 'xibo-static-v1' } = {}) {
    this.cache = null;
    this.cacheName = cacheName;
    this.log = new SWLogger('StaticCache');
  }

  async init() {
    this.cache = await caches.open(this.cacheName);
  }

  async get(cacheKey) {
    if (!this.cache) await this.init();
    return await this.cache.match(cacheKey, { ignoreSearch: true, ignoreVary: true });
  }

  async put(cacheKey, blob, contentType) {
    if (!this.cache) await this.init();
    const response = new Response(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': blob.size,
        'Access-Control-Allow-Origin': '*',
      }
    });
    await this.cache.put(cacheKey, response);
  }

  async delete(cacheKey) {
    if (!this.cache) await this.init();
    return await this.cache.delete(cacheKey);
  }

  async clear() {
    if (!this.cache) await this.init();
    const keys = await this.cache.keys();
    await Promise.all(keys.map(key => this.cache.delete(key)));
    this.log.info('Cleared', keys.length, 'cached files');
  }
}
