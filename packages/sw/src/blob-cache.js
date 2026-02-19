/**
 * BlobCache - LRU in-memory cache for blob objects
 * Prevents re-materializing blobs from Cache API on every Range request
 */

import { formatBytes } from './sw-utils.js';
import { SWLogger } from './chunk-config.js';

export class BlobCache {
  /**
   * @param {number} [maxSizeMB=200] - Maximum cache size in megabytes
   */
  constructor(maxSizeMB = 200) {
    this.cache = new Map(); // cacheKey → { blob, lastAccess, size }
    this.maxBytes = maxSizeMB * 1024 * 1024;
    this.currentBytes = 0;
    this.log = new SWLogger('BlobCache');
  }

  /**
   * Check if a key exists in memory cache (no Cache API fallback)
   * @param {string} cacheKey - Cache key
   * @returns {boolean}
   */
  has(cacheKey) {
    return this.cache.has(cacheKey);
  }

  /**
   * Get blob from cache or load via loader function
   * @param {string} cacheKey - Cache key
   * @param {Function} loader - Async function that returns blob
   * @returns {Promise<Blob>}
   */
  async get(cacheKey, loader) {
    // Check memory cache first
    if (this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey);
      entry.lastAccess = Date.now();
      this.log.debug(`HIT: ${cacheKey} (${formatBytes(entry.size)})`);
      return entry.blob;
    }

    // Cache miss - load from Cache API
    this.log.debug(`MISS: ${cacheKey} - loading from Cache API`);
    const blob = await loader();

    // Evict LRU entries if over limit
    while (this.currentBytes + blob.size > this.maxBytes && this.cache.size > 0) {
      this.evictLRU();
    }

    // Cache if under limit
    if (this.currentBytes + blob.size <= this.maxBytes) {
      this.cache.set(cacheKey, {
        blob,
        lastAccess: Date.now(),
        size: blob.size
      });
      this.currentBytes += blob.size;
      const utilization = (this.currentBytes / this.maxBytes * 100).toFixed(1);
      this.log.debug(`CACHED: ${cacheKey} (${formatBytes(blob.size)}) - utilization: ${utilization}%`);
    } else {
      this.log.debug(`Skipping memory cache (too large): ${cacheKey} (${formatBytes(blob.size)} > ${formatBytes(this.maxBytes)})`);
    }

    return blob;
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let oldest = null;
    let oldestKey = null;

    for (const [key, entry] of this.cache) {
      if (!oldest || entry.lastAccess < oldest.lastAccess) {
        oldest = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.currentBytes -= oldest.size;
      this.cache.delete(oldestKey);
      this.log.debug(`EVICTED LRU: ${oldestKey} (${formatBytes(oldest.size)})`);
    }
  }

  /**
   * Clear all cached blobs
   */
  clear() {
    this.cache.clear();
    this.currentBytes = 0;
    this.log.info('Cleared all cached blobs');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      bytes: this.currentBytes,
      maxBytes: this.maxBytes,
      utilization: (this.currentBytes / this.maxBytes * 100).toFixed(1) + '%'
    };
  }
}
