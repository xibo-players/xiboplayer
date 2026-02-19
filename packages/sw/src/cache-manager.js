/**
 * CacheManager - Wraps Cache API with type-aware keys and chunk support
 */

import { formatBytes } from './sw-utils.js';
import { SWLogger } from './chunk-config.js';

export class CacheManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheName='xibo-media-v1'] - Cache Storage name
   * @param {number} [options.chunkSize] - Chunk size in bytes (required for putChunked)
   */
  constructor({ cacheName = 'xibo-media-v1', chunkSize } = {}) {
    this.cache = null;
    this.cacheName = cacheName;
    this.chunkSize = chunkSize;
    this.log = new SWLogger('Cache');

    // In-memory metadata cache: cacheKey → metadata object
    // Eliminates Cache API lookups for chunk metadata on every Range request
    this.metadataCache = new Map();
  }

  async init() {
    this.cache = await caches.open(this.cacheName);
  }

  /**
   * Get cached file
   * Returns Response or null
   */
  async get(cacheKey) {
    if (!this.cache) await this.init();
    // Use ignoreVary and ignoreSearch for more lenient matching
    return await this.cache.match(cacheKey, {
      ignoreSearch: true,
      ignoreVary: true
    });
  }

  /**
   * Put file in cache
   */
  async put(cacheKey, blob, contentType) {
    if (!this.cache) await this.init();

    const response = new Response(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': blob.size,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes'
      }
    });

    await this.cache.put(cacheKey, response);
  }

  /**
   * Delete file from cache (whole file, or all chunks + metadata)
   */
  async delete(cacheKey) {
    if (!this.cache) await this.init();

    // Clear in-memory metadata cache
    const meta = this.metadataCache.get(cacheKey);
    this.metadataCache.delete(cacheKey);

    // If chunked, delete all chunks + metadata
    if (meta) {
      const promises = [this.cache.delete(`${cacheKey}/metadata`)];
      for (let i = 0; i < meta.numChunks; i++) {
        promises.push(this.cache.delete(`${cacheKey}/chunk-${i}`));
      }
      await Promise.all(promises);
      return true;
    }

    return await this.cache.delete(cacheKey);
  }

  /**
   * Clear all cached files
   */
  async clear() {
    if (!this.cache) await this.init();
    const keys = await this.cache.keys();
    await Promise.all(keys.map(key => this.cache.delete(key)));
    this.metadataCache.clear();
    this.log.info('Cleared', keys.length, 'cached files');
  }

  /**
   * Check if file exists (supports both whole files and chunked storage)
   * Single source of truth for file existence checks.
   * Uses in-memory metadataCache to avoid Cache API lookups on hot paths.
   * @param {string} cacheKey - Full cache key (e.g., /player/pwa/cache/media/6)
   * @returns {Promise<{exists: boolean, chunked: boolean, metadata: Object|null}>}
   */
  async fileExists(cacheKey) {
    if (!this.cache) await this.init();

    // Fast path: check in-memory metadata cache first (no async I/O)
    const cachedMeta = this.metadataCache.get(cacheKey);
    if (cachedMeta) {
      return { exists: true, chunked: true, metadata: cachedMeta };
    }

    // Check for whole file
    const wholeFile = await this.get(cacheKey);
    if (wholeFile) {
      return { exists: true, chunked: false, metadata: null };
    }

    // Check for chunked metadata (Cache API fallback)
    const metadata = await this.getMetadata(cacheKey);
    if (metadata && metadata.chunked) {
      // Populate in-memory cache for future requests
      this.metadataCache.set(cacheKey, metadata);
      return { exists: true, chunked: true, metadata };
    }

    return { exists: false, chunked: false, metadata: null };
  }

  /**
   * Get file size (works for both whole files and chunks)
   * @param {string} cacheKey - Full cache key
   * @returns {Promise<number|null>} File size in bytes, or null if not found
   */
  async getFileSize(cacheKey) {
    const info = await this.fileExists(cacheKey);

    if (!info.exists) return null;

    if (info.chunked) {
      return info.metadata.totalSize;  // From chunked metadata
    }

    const response = await this.get(cacheKey);
    const contentLength = response?.headers.get('Content-Length');
    return contentLength ? parseInt(contentLength) : null;
  }

  /**
   * Store file as chunks for large files (low memory streaming)
   * @param {string} cacheKey - Base cache key (e.g., /player/pwa/cache/media/123)
   * @param {Blob} blob - File blob to store as chunks
   * @param {string} contentType - Content type
   */
  async putChunked(cacheKey, blob, contentType) {
    if (!this.cache) await this.init();

    const chunkSize = this.chunkSize;
    const totalSize = blob.size;
    const numChunks = Math.ceil(totalSize / chunkSize);

    this.log.info(`Storing as ${numChunks} chunks: ${cacheKey} (${formatBytes(totalSize)})`);

    // Store metadata (complete: false until all chunks are written)
    const metadata = {
      totalSize,
      chunkSize,
      numChunks,
      contentType,
      chunked: true,
      complete: false,
      createdAt: Date.now()
    };

    const metadataResponse = new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' }
    });
    await this.cache.put(`${cacheKey}/metadata`, metadataResponse);
    // Populate in-memory cache
    this.metadataCache.set(cacheKey, metadata);

    // Store chunks
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunkBlob = blob.slice(start, end);

      const chunkResponse = new Response(chunkBlob, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': chunkBlob.size,
          'X-Chunk-Index': i,
          'X-Total-Chunks': numChunks
        }
      });

      await this.cache.put(`${cacheKey}/chunk-${i}`, chunkResponse);

      if ((i + 1) % 5 === 0 || i === numChunks - 1) {
        this.log.info(`Stored chunk ${i + 1}/${numChunks} (${formatBytes(chunkBlob.size)})`);
      }
    }

    // All chunks stored — mark metadata complete
    metadata.complete = true;
    await this.cache.put(`${cacheKey}/metadata`, new Response(
      JSON.stringify(metadata),
      { headers: { 'Content-Type': 'application/json' } }
    ));
    this.metadataCache.set(cacheKey, metadata);

    this.log.info(`Chunked storage complete: ${cacheKey}`);
  }

  /**
   * Get metadata for chunked file.
   * Checks in-memory cache first to avoid Cache API I/O on hot paths.
   * @param {string} cacheKey - Base cache key
   * @returns {Promise<Object|null>}
   */
  async getMetadata(cacheKey) {
    // Fast path: in-memory cache
    const cached = this.metadataCache.get(cacheKey);
    if (cached) return cached;

    if (!this.cache) await this.init();

    const response = await this.cache.match(`${cacheKey}/metadata`);
    if (!response) return null;

    const text = await response.text();
    const metadata = JSON.parse(text);

    // Populate in-memory cache
    this.metadataCache.set(cacheKey, metadata);
    return metadata;
  }

  /**
   * Update metadata both in Cache API and in-memory cache
   * @param {string} cacheKey - Base cache key
   * @param {Object} metadata - Metadata to store
   */
  async updateMetadata(cacheKey, metadata) {
    if (!this.cache) await this.init();
    await this.cache.put(`${cacheKey}/metadata`, new Response(
      JSON.stringify(metadata),
      { headers: { 'Content-Type': 'application/json' } }
    ));
    this.metadataCache.set(cacheKey, metadata);
  }

  /**
   * Check if file is stored as chunks
   * @param {string} cacheKey - Base cache key
   * @returns {Promise<boolean>}
   */
  async isChunked(cacheKey) {
    const metadata = await this.getMetadata(cacheKey);
    return metadata?.chunked === true;
  }

  /**
   * Get specific chunk
   * @param {string} cacheKey - Base cache key
   * @param {number} chunkIndex - Chunk index
   * @returns {Promise<Response|null>}
   */
  async getChunk(cacheKey, chunkIndex) {
    if (!this.cache) await this.init();
    return await this.cache.match(`${cacheKey}/chunk-${chunkIndex}`);
  }
}
