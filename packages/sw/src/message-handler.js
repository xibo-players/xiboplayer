/**
 * MessageHandler - Handles postMessage from client
 *
 * Manages download orchestration, progress reporting, and file management.
 * Media storage is handled by the proxy's DiskCache — the SW only orchestrates
 * downloads and notifies clients when files are ready.
 */

import { LayoutTaskBuilder, BARRIER, rewriteUrlForProxy } from '@xiboplayer/cache/download-manager';
import { formatBytes, BASE } from './sw-utils.js';
import { SWLogger } from './chunk-config.js';
import { extractMediaIdsFromXlf } from './xlf-parser.js';

/** Content-type map for static widget resources (JS, CSS, fonts, SVG) */
const STATIC_CONTENT_TYPES = {
  'js': 'application/javascript',
  'css': 'text/css',
  'otf': 'font/otf',
  'ttf': 'font/ttf',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'eot': 'application/vnd.ms-fontobject',
  'svg': 'image/svg+xml'
};

export class MessageHandler {
  /**
   * @param {Object} downloadManager - DownloadManager instance
   * @param {Object} config
   * @param {number} config.chunkSize - Chunk size in bytes
   * @param {number} config.chunkStorageThreshold - Files larger than this use chunked storage
   * @param {string} [config.staticCache='xibo-static-v1'] - Static cache name
   */
  constructor(downloadManager, config) {
    this.downloadManager = downloadManager;
    this.config = {
      staticCache: 'xibo-static-v1',
      ...config
    };
    this.log = new SWLogger('SW Message');
  }

  /**
   * Handle message from client
   */
  async handleMessage(event) {
    const { type, data } = event.data;

    if (type === 'GET_DOWNLOAD_PROGRESS') {
      this.log.debug('Received:', type);
    } else {
      this.log.info('Received:', type);
    }

    switch (type) {
      case 'PING': {
        this.log.info('PING received, broadcasting SW_READY');
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'SW_READY' });
        });
        return { success: true };
      }

      case 'DOWNLOAD_FILES':
        return await this.handleDownloadFiles(data);

      case 'PRIORITIZE_DOWNLOAD':
        return this.handlePrioritizeDownload(data.fileType, data.fileId);

      case 'CLEAR_CACHE':
        return await this.handleClearCache();

      case 'GET_DOWNLOAD_PROGRESS':
        return await this.handleGetProgress();

      case 'DELETE_FILES':
        return await this.handleDeleteFiles(data.files);

      case 'PREWARM_VIDEO_CHUNKS':
        // No-op: proxy serves from disk, no need for in-memory pre-warming
        return { success: true, warmed: 0, total: data?.mediaIds?.length || 0 };

      case 'PRIORITIZE_LAYOUT_FILES':
        this.downloadManager.prioritizeLayoutFiles(data.mediaIds);
        return { success: true };

      case 'URGENT_CHUNK':
        return this.handleUrgentChunk(data.fileType, data.fileId, data.chunkIndex);

      case 'GET_ALL_FILES':
        return await this.handleGetAllFiles();

      default:
        this.log.warn('Unknown message type:', type);
        return { success: false, error: 'Unknown message type' };
    }
  }

  /**
   * Handle DELETE_FILES message - purge obsolete files from DiskCache via proxy
   */
  async handleDeleteFiles(files) {
    if (!files || !Array.isArray(files)) {
      return { success: false, error: 'No files provided' };
    }

    try {
      const resp = await fetch('/media-cache/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const result = await resp.json();
      this.log.info(`Purge complete: ${result.deleted}/${result.total} files deleted`);
      return { success: true, deleted: result.deleted, total: result.total };
    } catch (err) {
      this.log.error('Delete failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle PRIORITIZE_DOWNLOAD - move file to front of download queue
   */
  handlePrioritizeDownload(fileType, fileId) {
    this.log.info('Prioritize request:', `${fileType}/${fileId}`);
    const found = this.downloadManager.queue.prioritize(fileType, fileId);
    this.downloadManager.queue.processQueue();
    return { success: true, found };
  }

  /**
   * Handle URGENT_CHUNK — emergency priority for a stalled streaming chunk.
   */
  handleUrgentChunk(fileType, fileId, chunkIndex) {
    this.log.info('Urgent chunk request:', `${fileType}/${fileId}`, 'chunk', chunkIndex);
    const acted = this.downloadManager.queue.urgentChunk(fileType, fileId, chunkIndex);
    return { success: true, acted };
  }

  /**
   * Handle DOWNLOAD_FILES with XLF-driven media resolution.
   */
  async handleDownloadFiles({ layoutOrder, files, layoutDependants }) {
    const dm = this.downloadManager;
    const queue = dm.queue;
    let enqueuedCount = 0;
    const enqueuedTasks = [];

    // Build lookup maps from flat CMS file list
    const xlfFiles = new Map();
    const resources = [];
    const mediaFiles = new Map();
    for (const f of files) {
      if (f.type === 'layout') {
        xlfFiles.set(parseInt(f.id), f);
      } else if (f.type === 'resource' || f.code === 'fonts.css'
          || (f.path && (f.path.includes('bundle.min') || f.path.includes('fonts')))) {
        resources.push(f);
      } else {
        if (f.path && f.path.includes('getData')) {
          f.isGetData = true;
        }
        mediaFiles.set(String(f.id), f);
      }
    }

    this.log.info(`Download: ${layoutOrder.length} layouts, ${mediaFiles.size} media, ${resources.length} resources`);

    // ── Step 1: Fetch + cache + parse all XLFs directly (parallel) ──
    const layoutMediaMap = new Map();
    const xlfPromises = [];
    for (const layoutId of layoutOrder) {
      const xlfFile = xlfFiles.get(layoutId);
      if (!xlfFile?.path) continue;

      xlfPromises.push((async () => {
        const cacheKey = `layout/${layoutId}`;
        // Check if XLF already cached on disk
        let xlfText;
        try {
          const headResp = await fetch(`/media-cache/${cacheKey}`, { method: 'HEAD' });
          if (headResp.ok) {
            const getResp = await fetch(`/media-cache/${cacheKey}`);
            xlfText = await getResp.text();
          }
        } catch (_) {}

        if (!xlfText) {
          const resp = await fetch(rewriteUrlForProxy(xlfFile.path));
          if (!resp.ok) { this.log.warn(`XLF fetch failed: ${layoutId} (${resp.status})`); return; }
          xlfText = await resp.text();
          this.log.info(`Fetched XLF ${layoutId} (${xlfText.length} bytes)`);
          // Notify clients
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'FILE_CACHED', fileId: String(layoutId), fileType: 'layout', size: xlfText.length }));
        }
        layoutMediaMap.set(layoutId, extractMediaIdsFromXlf(xlfText, this.log));
      })());
    }
    // Also fetch XLFs NOT in layoutOrder
    for (const [layoutId, xlfFile] of xlfFiles) {
      if (layoutOrder.includes(layoutId)) continue;
      xlfPromises.push((async () => {
        const cacheKey = `layout/${layoutId}`;
        let xlfText;
        try {
          const headResp = await fetch(`/media-cache/${cacheKey}`, { method: 'HEAD' });
          if (headResp.ok) {
            const getResp = await fetch(`/media-cache/${cacheKey}`);
            xlfText = await getResp.text();
          }
        } catch (_) {}

        if (!xlfText && xlfFile.path) {
          const resp = await fetch(rewriteUrlForProxy(xlfFile.path));
          if (resp.ok) {
            xlfText = await resp.text();
            this.log.info(`Fetched XLF ${layoutId} (non-scheduled, ${xlfText.length} bytes)`);
            const clients = await self.clients.matchAll();
            clients.forEach(c => c.postMessage({ type: 'FILE_CACHED', fileId: String(layoutId), fileType: 'layout', size: xlfText.length }));
          }
        }
        if (xlfText) {
          layoutMediaMap.set(layoutId, extractMediaIdsFromXlf(xlfText, this.log));
        }
      })());
    }
    await Promise.allSettled(xlfPromises);
    this.log.info(`Parsed ${layoutMediaMap.size} XLFs`);

    // ── Step 2: Enqueue resources ──
    const resourceBuilder = new LayoutTaskBuilder(queue);
    for (const file of resources) {
      const enqueued = await this._enqueueFile(dm, resourceBuilder, file, enqueuedTasks);
      if (enqueued) enqueuedCount++;
    }
    const resourceTasks = await resourceBuilder.build();
    if (resourceTasks.length > 0) {
      resourceTasks.push(BARRIER);
      queue.enqueueOrderedTasks(resourceTasks);
    }

    // ── Step 3: For each layout in play order, merge XLF + non-scheduled + dependants ──
    const claimed = new Set();
    const nonScheduledIds = [...layoutMediaMap.keys()].filter(id => !layoutOrder.includes(id));
    const filenameToMediaId = new Map();
    for (const [id, file] of mediaFiles) {
      if (file.saveAs) filenameToMediaId.set(file.saveAs, id);
    }

    const depMap = new Map();
    if (layoutDependants) {
      for (const [id, filenames] of Object.entries(layoutDependants)) {
        depMap.set(parseInt(id, 10), filenames);
      }
    }

    for (const layoutId of layoutOrder) {
      const xlfMediaIds = layoutMediaMap.get(layoutId);
      if (!xlfMediaIds) continue;

      const allMediaIds = new Set(xlfMediaIds);
      for (const nsId of nonScheduledIds) {
        const nsMediaIds = layoutMediaMap.get(nsId);
        if (nsMediaIds) {
          for (const id of nsMediaIds) allMediaIds.add(id);
        }
      }
      const deps = depMap.get(layoutId) || [];
      for (const filename of deps) {
        const mediaId = filenameToMediaId.get(filename);
        if (mediaId) allMediaIds.add(mediaId);
      }

      const matched = [];
      for (const id of allMediaIds) {
        if (claimed.has(id)) continue;
        const file = mediaFiles.get(id);
        if (file) {
          matched.push(file);
          claimed.add(id);
        }
      }
      if (matched.length === 0) continue;

      this.log.info(`Layout ${layoutId}: ${matched.length} media`);
      matched.sort((a, b) => (a.size || 0) - (b.size || 0));
      const builder = new LayoutTaskBuilder(queue);
      for (const file of matched) {
        const enqueued = await this._enqueueFile(dm, builder, file, enqueuedTasks);
        if (enqueued) enqueuedCount++;
      }
      const orderedTasks = await builder.build();
      if (orderedTasks.length > 0) {
        orderedTasks.push(BARRIER);
        queue.enqueueOrderedTasks(orderedTasks);
      }
    }

    // Enqueue unclaimed media
    const unclaimed = [...mediaFiles.keys()].filter(id => !claimed.has(id));
    if (unclaimed.length > 0) {
      this.log.info(`${unclaimed.length} media not in any XLF: ${unclaimed.join(', ')}`);
      const builder = new LayoutTaskBuilder(queue);
      for (const id of unclaimed) {
        const file = mediaFiles.get(id);
        if (file) {
          const enqueued = await this._enqueueFile(dm, builder, file, enqueuedTasks);
          if (enqueued) enqueuedCount++;
        }
      }
      const orderedTasks = await builder.build();
      if (orderedTasks.length > 0) {
        queue.enqueueOrderedTasks(orderedTasks);
      }
    }

    const activeCount = queue.running;
    const queuedCount = queue.queue.length;
    this.log.info('Downloads active:', activeCount, ', queued:', queuedCount);
    return { success: true, enqueuedCount, activeCount, queuedCount };
  }

  /**
   * Enqueue a single file for download.
   * Checks DiskCache via proxy HEAD, handles dedup and chunked resume.
   * @returns {boolean} true if file was enqueued
   */
  async _enqueueFile(dm, builder, file, enqueuedTasks) {
    if (!file.path || file.path === 'null' || file.path === 'undefined') {
      this.log.debug('Skipping file with no path:', file.id);
      return false;
    }

    const cacheKey = `${file.type}/${file.id}`;

    // Check if already cached on disk via proxy HEAD
    try {
      const headResp = await fetch(`/media-cache/${cacheKey}`, { method: 'HEAD' });
      if (headResp.ok) {
        this.log.debug('File already cached on disk:', cacheKey);
        await this.ensureStaticCacheEntry(file);
        return false;
      }
    } catch (_) {
      // Proxy not reachable — proceed with download
    }

    // Check if already downloading
    const stableKey = `${file.type}/${file.id}`;
    const activeTask = dm.getTask(stableKey);
    if (activeTask) {
      this.log.debug('File already downloading:', stableKey, '- skipping duplicate');
      return false;
    }

    const fileDownload = builder.addFile(file);
    if (fileDownload.state === 'pending') {
      const cachePromise = this._notifyAfterDownload(fileDownload, file);
      enqueuedTasks.push(cachePromise);
      return true;
    }
    return false;
  }

  /**
   * Notify clients after download completes.
   * The proxy already saved the file to disk during /file-proxy.
   * We just need to:
   * 1. Cache static resources (widgets) in the static Cache API
   * 2. Mark chunked files as complete
   * 3. Send FILE_CACHED notification
   */
  async _notifyAfterDownload(task, fileInfo) {
    try {
      const blob = await task.wait();
      const fileSize = parseInt(fileInfo.size) || blob.size;
      const cacheKey = `${fileInfo.type}/${fileInfo.id}`;

      this.log.info('Download complete:', cacheKey, `(${formatBytes(fileSize)})`);

      // Mark chunked files as complete on the proxy
      if (fileSize > this.config.chunkStorageThreshold) {
        try {
          await fetch('/media-cache/mark-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cacheKey }),
          });
        } catch (e) {
          this.log.warn('Failed to mark complete:', cacheKey, e.message);
        }
      }

      // Cache widget static resources in Cache API for fast serving
      if (blob.size > 0) {
        await this._cacheStaticResource(fileInfo, blob);
      }

      // Notify all clients that file is cached
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'FILE_CACHED',
          fileId: fileInfo.id,
          fileType: fileInfo.type,
          size: fileSize
        });
      });

      this.downloadManager.queue.removeCompleted(`${fileInfo.type}/${fileInfo.id}`);
      return blob;
    } catch (error) {
      this.log.error('Download failed:', fileInfo.id, error);
      this.downloadManager.queue.removeCompleted(`${fileInfo.type}/${fileInfo.id}`);
      throw error;
    }
  }

  /**
   * Cache widget static resources (.js, .css, fonts) in Cache API
   */
  async _cacheStaticResource(fileInfo, blob) {
    const filename = fileInfo.path ? (() => {
      try { return new URL(fileInfo.path).searchParams.get('file'); } catch { return null; }
    })() : null;

    if (filename && (filename.endsWith('.js') || filename.endsWith('.css') ||
        /\.(otf|ttf|woff2?|eot|svg)$/i.test(filename))) {
      try {
        const staticCache = await caches.open(this.config.staticCache);
        const staticKey = `${BASE}/cache/static/${filename}`;
        const ext = filename.split('.').pop().toLowerCase();
        const staticContentType = STATIC_CONTENT_TYPES[ext] || 'application/octet-stream';

        await staticCache.put(staticKey, new Response(blob.slice(0, blob.size, blob.type), {
          headers: { 'Content-Type': staticContentType }
        }));
        this.log.info('Cached as static resource:', filename, `(${staticContentType})`);
      } catch (e) {
        this.log.warn('Failed to cache static resource:', filename, e);
      }
    }
  }

  /**
   * No-op: static caching is handled by widget-html.js (main thread)
   */
  async ensureStaticCacheEntry(fileInfo) {}

  /**
   * Handle GET_ALL_FILES — list files from DiskCache via proxy
   */
  async handleGetAllFiles() {
    try {
      const resp = await fetch('/media-cache-list');
      const data = await resp.json();
      return { success: true, files: data.files || [] };
    } catch (err) {
      this.log.error('Failed to list files:', err.message);
      return { success: true, files: [] };
    }
  }

  /**
   * Handle CLEAR_CACHE — clear static cache (DiskCache cleared separately)
   */
  async handleClearCache() {
    this.log.info('Clearing static cache');
    const staticCache = await caches.open(this.config.staticCache);
    const keys = await staticCache.keys();
    await Promise.all(keys.map(key => staticCache.delete(key)));
    return { success: true };
  }

  /**
   * Handle GET_DOWNLOAD_PROGRESS
   */
  async handleGetProgress() {
    const progress = this.downloadManager.getProgress();
    return { success: true, progress };
  }
}
