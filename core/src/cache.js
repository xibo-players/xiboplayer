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

    // Download file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download ${path}: ${response.status}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Verify MD5
    const calculatedMd5 = SparkMD5.ArrayBuffer.hash(arrayBuffer);
    if (md5 && calculatedMd5 !== md5) {
      throw new Error(`MD5 mismatch for ${id}: expected ${md5}, got ${calculatedMd5}`);
    }

    // Cache the response
    const cacheKey = this.getCacheKey(type, id);
    await this.cache.put(cacheKey, new Response(blob, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': blob.size
      }
    }));

    // Save metadata
    const fileRecord = {
      id,
      type,
      path,
      md5: calculatedMd5,
      size: blob.size,
      cachedAt: Date.now()
    };
    await this.saveFile(fileRecord);

    console.log(`[Cache] Cached ${type}/${id} (${blob.size} bytes, MD5: ${calculatedMd5})`);
    return fileRecord;
  }

  /**
   * Get cache key for a file
   */
  getCacheKey(type, id) {
    return `/cache/${type}/${id}`;
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
