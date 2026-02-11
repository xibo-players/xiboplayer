/**
 * DownloadManager - Standalone file download orchestration
 *
 * Works in both browser and Service Worker contexts.
 * Handles download queue, concurrency control, parallel chunks, and MD5 verification.
 *
 * Architecture:
 * - DownloadQueue: Manages download queue with concurrency control
 * - DownloadTask: Handles individual file download with parallel chunks
 * - MD5Calculator: Calculates MD5 hash (optional, uses SparkMD5 if available)
 *
 * Usage:
 *   const dm = new DownloadManager({ concurrency: 4, chunkSize: 50MB });
 *   const task = dm.enqueue({ id, type, path, md5 });
 *   const blob = await task.wait();
 */

const DEFAULT_CONCURRENCY = 4; // Max concurrent file downloads
const DEFAULT_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
const DEFAULT_CHUNKS_PER_FILE = 4; // Parallel chunks per file

/**
 * DownloadTask - Handles individual file download
 */
export class DownloadTask {
  constructor(fileInfo, options = {}) {
    this.fileInfo = fileInfo;
    this.options = options;
    this.downloadedBytes = 0;
    this.totalBytes = 0;
    this.promise = null;
    this.resolve = null;
    this.reject = null;
    this.waiters = []; // Promises waiting for completion
    this.state = 'pending'; // pending, downloading, complete, failed
    // Progressive streaming: callback fired for each chunk as it downloads
    // Set externally before download starts: (chunkIndex, chunkBlob, totalChunks) => Promise
    this.onChunkDownloaded = null;
  }

  /**
   * Wait for download to complete
   * Returns blob when ready
   */
  async wait() {
    if (this.promise) {
      return this.promise;
    }

    if (this.state === 'complete') {
      return this.promise;
    }

    // Create waiter promise
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /**
   * Start download with parallel chunks
   */
  async start() {
    const { id, type, path, md5 } = this.fileInfo;

    try {
      this.state = 'downloading';
      console.log('[DownloadTask] Starting:', path);

      // HEAD request to get file size
      const headResponse = await fetch(path, { method: 'HEAD' });
      if (!headResponse.ok) {
        throw new Error(`HEAD request failed: ${headResponse.status}`);
      }

      this.totalBytes = parseInt(headResponse.headers.get('Content-Length') || '0');
      const contentType = headResponse.headers.get('Content-Type') || 'application/octet-stream';

      console.log('[DownloadTask] File size:', (this.totalBytes / 1024 / 1024).toFixed(1), 'MB');

      // Download in chunks if large file
      let blob;
      const chunkSize = this.options.chunkSize || DEFAULT_CHUNK_SIZE;
      const chunksPerFile = this.options.chunksPerFile || DEFAULT_CHUNKS_PER_FILE;

      if (this.totalBytes > 100 * 1024 * 1024) { // > 100MB
        blob = await this.downloadChunks(path, contentType, chunkSize, chunksPerFile);
      } else {
        blob = await this.downloadFull(path);
      }

      // Verify MD5 if provided and MD5 calculator available
      if (md5 && this.options.calculateMD5) {
        const calculatedMd5 = await this.options.calculateMD5(blob);
        if (calculatedMd5 && calculatedMd5 !== md5) {
          console.warn('[DownloadTask] MD5 mismatch:', path);
          console.warn('[DownloadTask]   Expected:', md5);
          console.warn('[DownloadTask]   Got:', calculatedMd5);
          // Continue anyway (kiosk mode)
        }
      }

      console.log('[DownloadTask] Complete:', path, `(${blob.size} bytes)`);

      // Mark complete
      this.state = 'complete';
      this.blob = blob;

      // Resolve all waiters
      this.promise = Promise.resolve(blob);
      for (const waiter of this.waiters) {
        waiter.resolve(blob);
      }
      this.waiters = [];

      return blob;

    } catch (error) {
      console.error('[DownloadTask] Failed:', path, error);
      this.state = 'failed';

      // Reject all waiters
      this.promise = Promise.reject(error);
      for (const waiter of this.waiters) {
        waiter.reject(error);
      }
      this.waiters = [];

      throw error;
    }
  }

  /**
   * Download full file (for small files)
   */
  async downloadFull(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();
    this.downloadedBytes = blob.size;
    return blob;
  }

  /**
   * Download file in parallel chunks (for large files)
   * If onChunkDownloaded callback is set, fires it for each chunk as it arrives
   * so the caller can cache chunks progressively (enabling streaming before
   * the entire file is downloaded).
   */
  async downloadChunks(url, contentType, chunkSize, concurrentChunks) {
    // Calculate chunk ranges
    const chunkRanges = [];
    for (let start = 0; start < this.totalBytes; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, this.totalBytes - 1);
      chunkRanges.push({ start, end, index: chunkRanges.length });
    }

    console.log('[DownloadTask] Downloading', chunkRanges.length, 'chunks in parallel');

    // Download chunks in parallel with concurrency limit
    const chunkMap = new Map();
    let nextChunkIndex = 0;

    const downloadChunk = async (range) => {
      const rangeHeader = `bytes=${range.start}-${range.end}`;

      try {
        const response = await fetch(url, {
          headers: { 'Range': rangeHeader }
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`Chunk ${range.index} failed: ${response.status}`);
        }

        const chunkBlob = await response.blob();
        chunkMap.set(range.index, chunkBlob);

        this.downloadedBytes += chunkBlob.size;
        const progress = (this.downloadedBytes / this.totalBytes * 100).toFixed(1);
        console.log('[DownloadTask] Chunk', range.index + 1, '/', chunkRanges.length, `(${progress}%)`);

        // Progressive streaming: notify caller to cache this chunk immediately
        if (this.onChunkDownloaded) {
          try {
            await this.onChunkDownloaded(range.index, chunkBlob, chunkRanges.length);
          } catch (e) {
            console.warn('[DownloadTask] onChunkDownloaded callback error:', e);
          }
        }

        // Notify progress if callback provided
        if (this.options.onProgress) {
          this.options.onProgress(this.downloadedBytes, this.totalBytes);
        }

        return chunkBlob;

      } catch (error) {
        console.error('[DownloadTask] Chunk', range.index, 'failed:', error);
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

    // Start concurrent downloaders
    const downloaders = [];
    for (let i = 0; i < concurrentChunks; i++) {
      downloaders.push(downloadNext());
    }
    await Promise.all(downloaders);

    // If progressive caching was used, skip reassembly (chunks are already cached)
    if (this.onChunkDownloaded) {
      // Return a lightweight marker — the real data is already in cache
      return new Blob([], { type: contentType });
    }

    // Reassemble chunks in order (traditional path for small chunked downloads)
    const orderedChunks = [];
    for (let i = 0; i < chunkRanges.length; i++) {
      orderedChunks.push(chunkMap.get(i));
    }

    return new Blob(orderedChunks, { type: contentType });
  }
}

/**
 * DownloadQueue - Manages download queue with concurrency control
 */
export class DownloadQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.chunksPerFile = options.chunksPerFile || DEFAULT_CHUNKS_PER_FILE;
    this.calculateMD5 = options.calculateMD5; // Optional MD5 calculator function
    this.onProgress = options.onProgress; // Optional progress callback

    this.queue = [];
    this.active = new Map(); // url -> DownloadTask
    this.running = 0;
  }

  /**
   * Add file to download queue
   * Returns existing task if already downloading
   */
  enqueue(fileInfo) {
    const { path } = fileInfo;

    // If already downloading, return existing task
    if (this.active.has(path)) {
      console.log('[DownloadQueue] File already downloading:', path);
      return this.active.get(path);
    }

    // Create new download task
    const task = new DownloadTask(fileInfo, {
      chunkSize: this.chunkSize,
      chunksPerFile: this.chunksPerFile,
      calculateMD5: this.calculateMD5,
      onProgress: this.onProgress
    });

    this.active.set(path, task);
    this.queue.push(task);

    console.log('[DownloadQueue] Enqueued:', path, `(${this.queue.length} pending, ${this.running} active)`);

    // Start download if capacity available
    this.processQueue();

    return task;
  }

  /**
   * Process queue - start downloads up to concurrency limit
   */
  async processQueue() {
    console.log('[DownloadQueue] processQueue:', this.running, 'running,', this.queue.length, 'queued');

    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.running++;

      console.log('[DownloadQueue] Starting:', task.fileInfo.path, `(${this.running}/${this.concurrency} active)`);

      // Start download (don't await - let it run in background)
      task.start()
        .finally(() => {
          this.running--;
          this.active.delete(task.fileInfo.path);
          console.log('[DownloadQueue] Complete:', task.fileInfo.path, `(${this.running} active, ${this.queue.length} pending)`);

          // Process next in queue
          this.processQueue();
        });
    }

    if (this.running >= this.concurrency) {
      console.log('[DownloadQueue] Concurrency limit reached:', this.running, '/', this.concurrency);
    }
    if (this.queue.length === 0 && this.running === 0) {
      console.log('[DownloadQueue] All downloads complete');
    }
  }

  /**
   * Move a file to the front of the queue (if still queued, not yet started)
   * @param {string} fileType - 'media' or 'layout'
   * @param {string} fileId - File ID
   * @returns {boolean} true if file was found (queued or active)
   */
  prioritize(fileType, fileId) {
    const idx = this.queue.findIndex(task =>
      task.fileInfo.type === fileType && String(task.fileInfo.id) === String(fileId)
    );

    if (idx > 0) {
      const [task] = this.queue.splice(idx, 1);
      this.queue.unshift(task);
      console.log('[DownloadQueue] Prioritized:', `${fileType}/${fileId}`, '(moved to front of queue)');
      return true;
    }

    if (idx === 0) {
      console.log('[DownloadQueue] Already at front:', `${fileType}/${fileId}`);
      return true;
    }

    // Check if already downloading
    for (const [, task] of this.active) {
      if (task.fileInfo.type === fileType && String(task.fileInfo.id) === String(fileId)) {
        console.log('[DownloadQueue] Already downloading:', `${fileType}/${fileId}`);
        return true;
      }
    }

    console.log('[DownloadQueue] Not found in queue:', `${fileType}/${fileId}`);
    return false;
  }

  /**
   * Get task by URL (returns null if not downloading)
   */
  getTask(url) {
    return this.active.get(url) || null;
  }

  /**
   * Get progress for all active downloads
   */
  getProgress() {
    const progress = {};
    for (const [url, task] of this.active.entries()) {
      progress[url] = {
        downloaded: task.downloadedBytes,
        total: task.totalBytes,
        percent: task.totalBytes > 0 ? (task.downloadedBytes / task.totalBytes * 100).toFixed(1) : 0,
        state: task.state
      };
    }
    return progress;
  }

  /**
   * Cancel all downloads
   */
  clear() {
    this.queue = [];
    this.active.clear();
    this.running = 0;
  }
}

/**
 * DownloadManager - Main API
 */
export class DownloadManager {
  constructor(options = {}) {
    this.queue = new DownloadQueue(options);
  }

  /**
   * Enqueue file for download
   * @param {Object} fileInfo - { id, type, path, md5 }
   * @returns {DownloadTask}
   */
  enqueue(fileInfo) {
    return this.queue.enqueue(fileInfo);
  }

  /**
   * Get download task by URL
   */
  getTask(url) {
    return this.queue.getTask(url);
  }

  /**
   * Get progress for all downloads
   */
  getProgress() {
    return this.queue.getProgress();
  }

  /**
   * Clear all downloads
   */
  clear() {
    this.queue.clear();
  }
}
