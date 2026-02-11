/**
 * File cache manager using Cache API and IndexedDB
 */

import SparkMD5 from 'spark-md5';
import { config } from '@xiboplayer/utils';

const CACHE_NAME = 'xibo-media-v1';
const DB_NAME = 'xibo-player';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const CONCURRENT_CHUNKS = 4; // Download 4 chunks simultaneously for 4x speedup

export class CacheManager {
  constructor() {
    this.cache = null;
    this.db = null;
    // Dependants: mediaId → Set<layoutId> — tracks which layouts use each media file
    this.dependants = new Map();
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
   *
   * Note: This method is a fallback for when Service Worker is not active.
   * When Service Worker is running, file downloads are handled by sw.js.
   */
  async downloadFile(fileInfo) {
    const { id, type, path, md5, download } = fileInfo;

    // Check if Service Worker is handling downloads
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      console.log(`[Cache] Service Worker active - skipping direct download for ${type}/${id}`);
      console.log(`[Cache] File will be downloaded by Service Worker in background`);
      return {
        id,
        type,
        path,
        md5: md5 || 'pending',
        size: 0,
        cachedAt: Date.now(),
        isServiceWorkerDownload: true
      };
    }

    // Skip files with no URL (widgets/resources generated on-demand)
    if (!path || path === 'null' || path === 'undefined') {
      console.log(`[Cache] Skipping ${type}/${id} - no download URL (will be generated on-demand)`);
      return null;
    }

    // Check if already cached
    const existing = await this.getFile(id);
    const cacheKey = this.getCacheKey(type, id);

    if (existing) {
      // Check if MD5 matches current expected value
      if (existing.md5 === md5) {
        // MD5 matches - verify file isn't corrupted
        const cachedResponse = await this.cache.match(cacheKey);

        if (cachedResponse && type === 'media') {
          const blob = await cachedResponse.blob();
          const contentType = cachedResponse.headers.get('Content-Type');

          // Delete bad cache (text/plain errors or tiny files)
          if (contentType === 'text/plain' || blob.size < 100) {
            console.warn(`[Cache] Bad cache detected for ${type}/${id} (${contentType}, ${blob.size} bytes) - re-downloading`);
            await this.cache.delete(cacheKey);
            // Continue to download below
          } else {
            console.log(`[Cache] ${type}/${id} already cached`);
            return existing;
          }
        } else {
          console.log(`[Cache] ${type}/${id} already cached`);
          return existing;
        }
      } else {
        // MD5 mismatch - file has been updated on CMS
        console.warn(`[Cache] ${type}/${id} MD5 changed (cached: ${existing.md5}, expected: ${md5}) - re-downloading`);
        await this.cache.delete(cacheKey);
        // Continue to download below
      }
    }

    console.log(`[Cache] Downloading ${type}/${id} from ${path}`);

    // Rewrite URL to use configured CMS (handles proxy case)
    const downloadUrl = this.rewriteUrl(path);
    console.log(`[Cache] Using URL: ${downloadUrl}`);

    // Check file size with HEAD request first (avoid downloading unnecessarily)
    const headResponse = await fetch(downloadUrl, { method: 'HEAD' });

    // HTTP 202 means Service Worker is still downloading in background
    // Don't proceed with caching - file isn't ready yet
    // Return pending metadata instead of throwing (allows collection to continue)
    if (headResponse.status === 202) {
      console.warn(`[Cache] ${type}/${id} still downloading in background (HTTP 202) - will retry on next collection`);
      return {
        id,
        type,
        path,
        md5: md5 || 'pending',
        size: 0,
        cachedAt: Date.now(),
        isPending: true  // Mark as pending for retry
      };
    }

    const contentLength = parseInt(headResponse.headers.get('Content-Length') || '0');
    const isLargeFile = contentLength > 100 * 1024 * 1024; // > 100 MB

    console.log(`[Cache] File size: ${(contentLength / 1024 / 1024).toFixed(1)} MB ${isLargeFile ? '(large file)' : ''}`);

    // filename already has cacheKey from above (line 143)
    const filename = type === 'media' ? this.extractFilename(path) : id;

    // Also create MD5-based cache key for content-addressable lookup
    // This allows Service Worker to find files by content hash instead of filename
    const md5CacheKey = md5 ? `/cache/hash/${md5}` : null;

    let calculatedMd5;
    let fileSize;

    if (isLargeFile) {
      // Large file: Cache in background for future use, but don't block
      console.log(`[Cache] Large file detected (${(contentLength / 1024 / 1024).toFixed(1)} MB), caching in background`);

      // Start background download (don't await)
      this.downloadLargeFileInBackground(downloadUrl, cacheKey, contentLength, filename, id, type, path, md5)
        .catch(err => console.warn(`[Cache] Background download failed for ${id}:`, err));

      // Return immediately - don't block collection cycle
      const metadata = {
        id,
        type,
        path,
        md5: md5 || 'pending',
        size: contentLength,
        cachedAt: Date.now(),
        isBackgroundDownload: true
      };

      await this.saveFile(metadata);

      console.log(`[Cache] ${type}/${id} downloading in background (${contentLength} bytes)`);

      return metadata;
    } else {
      // Small file: Download fully and verify MD5
      this.notifyDownloadProgress(filename, 0, contentLength);

      // Now do the actual download for small files
      const response = await fetch(downloadUrl);

      // HTTP 202 means Service Worker is still downloading in background
      // Don't cache the 202 response - it's just a placeholder message
      // Return pending metadata instead of throwing (allows collection to continue)
      if (response.status === 202) {
        console.warn(`[Cache] ${type}/${id} still downloading in background (HTTP 202) - will retry on next collection`);
        return {
          id,
          type,
          path,
          md5: md5 || 'pending',
          size: 0,
          cachedAt: Date.now(),
          isPending: true  // Mark as pending for retry
        };
      }

      if (!response.ok) {
        throw new Error(`Failed to download ${path}: ${response.status}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Verify MD5
      calculatedMd5 = SparkMD5.ArrayBuffer.hash(arrayBuffer);
      if (md5 && calculatedMd5 !== md5) {
        // KIOSK MODE: Log MD5 mismatches but always continue
        // Rendering methods (renderImage, renderVideo, renderLayout, etc.) will
        // naturally fail if wrong file type is provided
        // This ensures maximum uptime for kiosk deployments
        console.warn(`[Cache] MD5 mismatch for ${type}/${id}:`);
        console.warn(`[Cache]   Expected: ${md5}`);
        console.warn(`[Cache]   Got:      ${calculatedMd5}`);
        console.warn(`[Cache]   Accepting file anyway (kiosk mode - renderer will validate)`);

        // Use the file regardless - let the renderer handle validation
        calculatedMd5 = md5; // Prevent re-download loop
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
    return `/player/pwa/cache/${type}/${key}`;
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
   * Get cached file as Response (preserves headers like Content-Type)
   */
  async getCachedResponse(type, id) {
    const cacheKey = this.getCacheKey(type, id);
    return await this.cache.match(cacheKey);
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
    const cacheKey = `/player/pwa/cache/widget/${layoutId}/${regionId}/${mediaId}`;
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

    // Rewrite absolute CMS signed URLs to local cache paths
    // Matches: https://cms/xmds.php?file=bundle.min.js&...&X-Amz-Signature=...
    // These absolute URLs bypass the <base> tag entirely, causing slow CMS fetches
    const cmsUrlRegex = /https?:\/\/[^"'\s)]+xmds\.php\?[^"'\s)]*file=([^&"'\s)]+)[^"'\s)]*/g;
    const staticResources = [];
    modifiedHtml = modifiedHtml.replace(cmsUrlRegex, (match, filename) => {
      const localPath = `/player/pwa/cache/static/${filename}`;
      staticResources.push({ filename, originalUrl: match });
      console.log(`[Cache] Rewrote widget URL: ${filename} → ${localPath}`);
      return localPath;
    });

    // Rewrite Interactive Control hostAddress to SW-interceptable path
    // The IC library uses hostAddress + '/info', '/trigger', etc.
    // Original: hostAddress: "https://cms.example.com" → XHR to /info goes to CMS (fails)
    // Rewritten: hostAddress: "/player/pwa/ic" → XHR to /player/pwa/ic/info (intercepted by SW)
    modifiedHtml = modifiedHtml.replace(
      /hostAddress\s*:\s*["']https?:\/\/[^"']+["']/g,
      'hostAddress: "/player/pwa/ic"'
    );

    console.log(`[Cache] Injected base tag and rewrote CMS URLs in widget HTML`);

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

    // Fetch and cache static resources (shared Cache API - accessible from main thread and SW)
    if (staticResources.length > 0) {
      const STATIC_CACHE_NAME = 'xibo-static-v1';
      const staticCache = await caches.open(STATIC_CACHE_NAME);

      await Promise.all(staticResources.map(async ({ filename, originalUrl }) => {
        const staticKey = `/player/pwa/cache/static/${filename}`;
        const existing = await staticCache.match(staticKey);
        if (existing) return; // Already cached

        try {
          const resp = await fetch(originalUrl);
          if (!resp.ok) {
            console.warn(`[Cache] Failed to fetch static resource: ${filename} (HTTP ${resp.status})`);
            return;
          }

          const ext = filename.split('.').pop().toLowerCase();
          const contentType = {
            'js': 'application/javascript',
            'css': 'text/css',
            'otf': 'font/otf', 'ttf': 'font/ttf',
            'woff': 'font/woff', 'woff2': 'font/woff2',
            'eot': 'application/vnd.ms-fontobject',
            'svg': 'image/svg+xml'
          }[ext] || 'application/octet-stream';

          // For CSS files, rewrite font URLs and cache referenced font files
          if (ext === 'css') {
            let cssText = await resp.text();
            const fontResources = [];
            const fontUrlRegex = /url\((['"]?)(https?:\/\/[^'")\s]+\?[^'")\s]*file=([^&'")\s]+\.(?:woff2?|ttf|otf|eot|svg))[^'")\s]*)\1\)/gi;
            cssText = cssText.replace(fontUrlRegex, (_match, quote, fullUrl, fontFilename) => {
              fontResources.push({ filename: fontFilename, originalUrl: fullUrl });
              console.log(`[Cache] Rewrote font URL in CSS: ${fontFilename}`);
              return `url(${quote}/player/pwa/cache/static/${encodeURIComponent(fontFilename)}${quote})`;
            });

            await staticCache.put(staticKey, new Response(cssText, {
              headers: { 'Content-Type': 'text/css' }
            }));
            console.log(`[Cache] Cached CSS with ${fontResources.length} rewritten font URLs: ${filename}`);

            // Fetch and cache referenced font files
            await Promise.all(fontResources.map(async ({ filename: fontFile, originalUrl: fontUrl }) => {
              const fontKey = `/player/pwa/cache/static/${encodeURIComponent(fontFile)}`;
              const existingFont = await staticCache.match(fontKey);
              if (existingFont) return;

              try {
                const fontResp = await fetch(fontUrl);
                if (!fontResp.ok) {
                  console.warn(`[Cache] Failed to fetch font: ${fontFile} (HTTP ${fontResp.status})`);
                  return;
                }
                const fontBlob = await fontResp.blob();
                const fontExt = fontFile.split('.').pop().toLowerCase();
                const fontContentType = {
                  'otf': 'font/otf', 'ttf': 'font/ttf',
                  'woff': 'font/woff', 'woff2': 'font/woff2',
                  'eot': 'application/vnd.ms-fontobject',
                  'svg': 'image/svg+xml'
                }[fontExt] || 'application/octet-stream';

                await staticCache.put(fontKey, new Response(fontBlob, {
                  headers: { 'Content-Type': fontContentType }
                }));
                console.log(`[Cache] Cached font: ${fontFile} (${fontContentType}, ${fontBlob.size} bytes)`);
              } catch (fontErr) {
                console.warn(`[Cache] Failed to cache font: ${fontFile}`, fontErr);
              }
            }));
          } else {
            const blob = await resp.blob();
            await staticCache.put(staticKey, new Response(blob, {
              headers: { 'Content-Type': contentType }
            }));
            console.log(`[Cache] Cached static resource: ${filename} (${contentType}, ${blob.size} bytes)`);
          }
        } catch (error) {
          console.warn(`[Cache] Failed to cache static resource: ${filename}`, error);
        }
      }));
    }

    return cacheKey;
  }

  /**
   * Track that a media file is used by a layout (dependant)
   * @param {string|number} mediaId
   * @param {string|number} layoutId
   */
  addDependant(mediaId, layoutId) {
    const key = String(mediaId);
    if (!this.dependants.has(key)) {
      this.dependants.set(key, new Set());
    }
    this.dependants.get(key).add(String(layoutId));
  }

  /**
   * Remove a layout from all dependant sets (layout removed from schedule)
   * @param {string|number} layoutId
   * @returns {string[]} Media IDs that are now orphaned (no layouts reference them)
   */
  removeLayoutDependants(layoutId) {
    const lid = String(layoutId);
    const orphaned = [];

    for (const [mediaId, layouts] of this.dependants) {
      layouts.delete(lid);
      if (layouts.size === 0) {
        this.dependants.delete(mediaId);
        orphaned.push(mediaId);
      }
    }

    if (orphaned.length > 0) {
      console.log(`[Cache] ${orphaned.length} media files orphaned after layout ${layoutId} removed:`, orphaned);
    }
    return orphaned;
  }

  /**
   * Check if a media file is still referenced by any layout
   * @param {string|number} mediaId
   * @returns {boolean}
   */
  isMediaReferenced(mediaId) {
    const layouts = this.dependants.get(String(mediaId));
    return layouts ? layouts.size > 0 : false;
  }

  /**
   * Download large file in background (non-blocking)
   * Continues after collection cycle completes
   * Uses parallel chunk downloads for 4x speedup
   */
  async downloadLargeFileInBackground(downloadUrl, cacheKey, contentLength, filename, id, type, path, md5) {
    const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB chunks
    let downloadedBytes = 0;

    console.log(`[Cache] Background download started: ${filename}`);
    this.notifyDownloadProgress(filename, 0, contentLength);

    try {
      // Calculate all chunk ranges
      const chunkRanges = [];
      for (let start = 0; start < contentLength; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, contentLength - 1);
        chunkRanges.push({ start, end, index: chunkRanges.length });
      }

      console.log(`[Cache] Downloading ${chunkRanges.length} chunks in parallel (${CONCURRENT_CHUNKS} concurrent)`);

      // Parallel download with concurrency limit
      const chunkMap = new Map(); // position -> blob
      let nextChunkIndex = 0;

      const downloadChunk = async (range) => {
        const rangeHeader = `bytes=${range.start}-${range.end}`;

        try {
          const chunkResponse = await fetch(downloadUrl, {
            headers: { 'Range': rangeHeader }
          });

          if (!chunkResponse.ok && chunkResponse.status !== 206) {
            throw new Error(`Chunk ${range.index} failed: ${chunkResponse.status}`);
          }

          const chunkBlob = await chunkResponse.blob();
          chunkMap.set(range.index, chunkBlob);

          downloadedBytes += chunkBlob.size;
          const progress = ((downloadedBytes / contentLength) * 100).toFixed(1);
          console.log(`[Cache] Chunk ${range.index}/${chunkRanges.length - 1} complete (${progress}%)`);
          this.notifyDownloadProgress(filename, downloadedBytes, contentLength);

          return chunkBlob;
        } catch (error) {
          console.error(`[Cache] Chunk ${range.index} failed:`, error);
          throw error;
        }
      };

      // Download with concurrency control
      const downloadNext = async () => {
        while (nextChunkIndex < chunkRanges.length) {
          const range = chunkRanges[nextChunkIndex++];
          await downloadChunk(range);
        }
      };

      // Start CONCURRENT_CHUNKS parallel downloaders
      const downloaders = [];
      for (let i = 0; i < CONCURRENT_CHUNKS; i++) {
        downloaders.push(downloadNext());
      }

      await Promise.all(downloaders);

      // Reassemble chunks in order
      const orderedChunks = [];
      for (let i = 0; i < chunkRanges.length; i++) {
        orderedChunks.push(chunkMap.get(i));
      }

      // Combine all chunks
      const blob = new Blob(orderedChunks);

      // Get content type from first chunk response
      const contentType = orderedChunks[0]?.type || 'video/mp4';

      // Cache the complete file
      await this.cache.put(cacheKey, new Response(blob, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': blob.size,
          'Accept-Ranges': 'bytes'
        }
      }));

      // Update metadata
      const metadata = {
        id,
        type,
        path,
        md5: md5 || 'background',
        size: blob.size,
        cachedAt: Date.now(),
        isBackgroundDownload: false,
        cached: true
      };

      await this.saveFile(metadata);

      this.notifyDownloadProgress(filename, downloadedBytes, contentLength, true);

      console.log(`[Cache] Background download complete: ${filename} (${blob.size} bytes in ${orderedChunks.length} chunks)`);

      // Notify that file is now available for playback
      window.dispatchEvent(new CustomEvent('media-cached', {
        detail: { filename, id, type, size: blob.size }
      }));
    } catch (error) {
      console.error(`[Cache] Background download failed for ${filename}:`, error);
      this.notifyDownloadProgress(filename, downloadedBytes, contentLength, false, true);
    }
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
