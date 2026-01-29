/**
 * File cache manager using Cache API and IndexedDB
 */

import SparkMD5 from 'spark-md5';
import { config } from './config.js';

const CACHE_NAME = 'xibo-media-v1';
const DB_NAME = 'xibo-player';
const DB_VERSION = 1;
const STORE_FILES = 'files';

export class CacheManager {
  constructor() {
    this.cache = null;
    this.db = null;
  }

  /**
   * Extract filename from download URL
   * URL format: https://.../xmds.php?file=1.png&...
   */
  extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const fileParam = urlObj.searchParams.get('file');
      return fileParam || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Rewrite CMS URL to use configured CMS address
   * Handles cases where RequiredFiles returns absolute URLs
   */
  rewriteUrl(url) {
    if (!url) return url;

    // If URL is absolute and points to a different domain, rewrite it
    try {
      const urlObj = new URL(url);
      const configUrl = new URL(config.cmsAddress);

      // If domains differ, replace with configured CMS address
      if (urlObj.origin !== configUrl.origin) {
        console.log(`[Cache] Rewriting URL: ${urlObj.origin} → ${configUrl.origin}`);
        urlObj.protocol = configUrl.protocol;
        urlObj.hostname = configUrl.hostname;
        urlObj.port = configUrl.port;
        return urlObj.toString();
      }
    } catch (e) {
      // Not a valid URL, return as-is
    }

    return url;
  }

  /**
   * Initialize cache and database
   */
  async init() {
    this.cache = await caches.open(CACHE_NAME);
    this.db = await this.openDB();
  }

  /**
   * Open IndexedDB
   */
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  /**
   * Get file record from IndexedDB
   */
  async getFile(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save file record to IndexedDB
   */
  async saveFile(fileRecord) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const request = store.put(fileRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all file records
   */
  async getAllFiles() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Download and cache a file with MD5 verification
   * Handles large files with streaming to avoid memory issues
   */
  async downloadFile(fileInfo) {
    const { id, type, path, md5, download } = fileInfo;

    // Check if already cached with correct MD5
    const existing = await this.getFile(id);
    if (existing && existing.md5 === md5) {
      console.log(`[Cache] ${type}/${id} already cached`);
      return existing;
    }

    console.log(`[Cache] Downloading ${type}/${id} from ${path}`);

    // Rewrite URL to use configured CMS (handles proxy case)
    const downloadUrl = this.rewriteUrl(path);
    console.log(`[Cache] Using URL: ${downloadUrl}`);

    // Check file size with HEAD request first (avoid downloading unnecessarily)
    const headResponse = await fetch(downloadUrl, { method: 'HEAD' });
    const contentLength = parseInt(headResponse.headers.get('Content-Length') || '0');
    const isLargeFile = contentLength > 100 * 1024 * 1024; // > 100 MB

    console.log(`[Cache] File size: ${(contentLength / 1024 / 1024).toFixed(1)} MB ${isLargeFile ? '(large file)' : ''}`);

    // Extract filename from path for media files
    const filename = type === 'media' ? this.extractFilename(path) : id;
    const cacheKey = this.getCacheKey(type, id, filename);

    let calculatedMd5;
    let fileSize;

    if (isLargeFile) {
      // Large file: Use lazy chunk caching for streaming playback
      // Instead of downloading all chunks upfront, we'll download on-demand
      // as the video player requests ranges via Service Worker
      console.log(`[Cache] Large file detected (${(contentLength / 1024 / 1024).toFixed(1)} MB), enabling streaming mode`);

      // Create a streaming metadata record
      // The actual chunks will be cached on-demand by Service Worker
      const streamingMetadata = {
        id,
        type,
        path,
        md5: md5 || 'streaming',
        size: contentLength,
        cachedAt: Date.now(),
        isStreaming: true,
        downloadUrl: downloadUrl,
        contentType: headResponse.headers.get('Content-Type') || 'video/mp4'
      };

      await this.saveFile(streamingMetadata);

      // Mark as cached (Service Worker will handle on-demand chunk downloads)
      console.log(`[Cache] Enabled streaming for ${type}/${id} (${contentLength} bytes, chunks downloaded on-demand)`);

      calculatedMd5 = md5 || 'streaming';
      fileSize = contentLength;

      return streamingMetadata;
    } else {
      // Small file: Download fully and verify MD5
      this.notifyDownloadProgress(filename, 0, contentLength);

      // Now do the actual download for small files
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download ${path}: ${response.status}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Verify MD5
      calculatedMd5 = SparkMD5.ArrayBuffer.hash(arrayBuffer);
      if (md5 && calculatedMd5 !== md5) {
        this.notifyDownloadProgress(filename, 0, contentLength, false, true); // Error
        throw new Error(`MD5 mismatch for ${id}: expected ${md5}, got ${calculatedMd5}`);
      }

      // Cache the response
      await this.cache.put(cacheKey, new Response(blob, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Length': blob.size
        }
      }));

      fileSize = blob.size;
      this.notifyDownloadProgress(filename, fileSize, contentLength, true);
      console.log(`[Cache] Cached ${type}/${id} (${fileSize} bytes, MD5: ${calculatedMd5})`);
    }

    // Save metadata
    const fileRecord = {
      id,
      type,
      path,
      md5: calculatedMd5,
      size: fileSize,
      cachedAt: Date.now()
    };
    await this.saveFile(fileRecord);

    return fileRecord;
  }

  /**
   * Get cache key for a file
   * For media, uses the actual filename; for layouts, uses the ID
   */
  getCacheKey(type, id, filename = null) {
    const key = filename || id;
    return `/cache/${type}/${key}`;
  }

  /**
   * Get cached file as blob
   */
  async getCachedFile(type, id) {
    const cacheKey = this.getCacheKey(type, id);
    const response = await this.cache.match(cacheKey);
    if (!response) {
      return null;
    }
    return await response.blob();
  }

  /**
   * Get cached file as text
   */
  async getCachedFileText(type, id) {
    const cacheKey = this.getCacheKey(type, id);
    const response = await this.cache.match(cacheKey);
    if (!response) {
      return null;
    }
    return await response.text();
  }

  /**
   * Store widget HTML in cache for iframe loading
   * @param {string} layoutId - Layout ID
   * @param {string} regionId - Region ID
   * @param {string} mediaId - Media ID
   * @param {string} html - Widget HTML content
   * @returns {Promise<string>} Cache key URL
   */
  async cacheWidgetHtml(layoutId, regionId, mediaId, html) {
    const cacheKey = `/cache/widget/${layoutId}/${regionId}/${mediaId}`;
    const cache = await caches.open(CACHE_NAME);

    // Inject <base> tag to fix relative paths for widget dependencies
    // Widget HTML has relative paths like "bundle.min.js" that should resolve to /player/cache/media/
    const baseTag = '<base href="/player/cache/media/">';
    let modifiedHtml = html;

    // Insert base tag after <head> opening tag
    if (html.includes('<head>')) {
      modifiedHtml = html.replace('<head>', '<head>' + baseTag);
    } else if (html.includes('<HEAD>')) {
      modifiedHtml = html.replace('<HEAD>', '<HEAD>' + baseTag);
    } else {
      // No head tag, prepend base tag
      modifiedHtml = baseTag + html;
    }

    console.log(`[Cache] Injected base tag into widget HTML`);

    // Construct full URL for cache storage
    const cacheUrl = new URL(cacheKey, window.location.origin);

    const response = new Response(modifiedHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });

    await cache.put(cacheUrl, response);
    console.log(`[Cache] Stored widget HTML at ${cacheKey} (${modifiedHtml.length} bytes)`);

    return cacheKey;
  }

  /**
   * Notify UI about download progress
   */
  notifyDownloadProgress(filename, loaded, total, complete = false, error = false) {
    const event = new CustomEvent('download-progress', {
      detail: {
        filename,
        loaded,
        total,
        percent: total > 0 ? (loaded / total) * 100 : 0,
        complete,
        error
      }
    });
    window.dispatchEvent(event);
  }

  /**
   * Clear all cached files
   */
  async clearAll() {
    await caches.delete(CACHE_NAME);
    this.cache = await caches.open(CACHE_NAME);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const cacheManager = new CacheManager();
