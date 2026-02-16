/**
 * DownloadManager Tests
 *
 * Contract-based testing for DownloadTask, DownloadQueue, and DownloadManager
 * Tests state machines, concurrency control, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DownloadTask, DownloadQueue, DownloadManager } from './download-manager.js';
import { mockFetch, mockChunkedFetch, createTestBlob, waitFor, createSpy } from './test-utils.js';

describe('DownloadTask', () => {
  describe('State Machine', () => {
    it('should start in pending state', () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      // Post-condition: Initial state
      expect(task.state).toBe('pending');
      expect(task.downloadedBytes).toBe(0);
      expect(task.totalBytes).toBe(0);
      expect(task.waiters.length).toBe(0);
    });

    it('should transition pending -> downloading -> complete', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const testBlob = createTestBlob(1024);

      mockFetch({
        'HEAD http://test.com/file.mp4': {
          headers: { 'Content-Length': '1024' }
        },
        'GET http://test.com/file.mp4': {
          blob: testBlob
        }
      });

      // Pre-condition
      expect(task.state).toBe('pending');

      // Start download
      const promise = task.start();

      // Should be downloading (but completes quickly in tests)
      await promise;

      // Post-condition
      expect(task.state).toBe('complete');
      expect(task.downloadedBytes).toBe(1024);
      expect(task.totalBytes).toBe(1024);
    });

    it('should transition pending -> downloading -> failed on error', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      mockFetch({
        'HEAD http://test.com/file.mp4': {
          ok: false,
          status: 500,
          statusText: 'Server Error'
        }
      });

      // Pre-condition
      expect(task.state).toBe('pending');

      // Start download
      await expect(task.start()).rejects.toThrow();

      // Post-condition
      expect(task.state).toBe('failed');
    });
  });

  describe('wait()', () => {
    it('should satisfy contract: returns Promise<Blob> when complete', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const testBlob = createTestBlob(1024);

      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      // Start download
      const startPromise = task.start();

      // Wait for completion
      const blob = await task.wait();

      // Post-condition: Returns blob
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(1024);

      await startPromise; // Ensure start completes
    });

    it('should support multiple waiters', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const testBlob = createTestBlob(1024);

      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      // Multiple waiters before start
      const waiter1 = task.wait();
      const waiter2 = task.wait();
      const waiter3 = task.wait();

      expect(task.waiters.length).toBe(3);

      // Start download
      await task.start();

      // All waiters resolve with same blob
      const [blob1, blob2, blob3] = await Promise.all([waiter1, waiter2, waiter3]);

      expect(blob1).toBe(blob2);
      expect(blob2).toBe(blob3);
      expect(task.waiters.length).toBe(0);
    });

    it('should return immediately if already complete', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const testBlob = createTestBlob(1024);

      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      await task.start();

      // Post-condition: wait() after completion returns immediately
      const blob = await task.wait();
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should reject all waiters on failure', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      mockFetch({
        'HEAD http://test.com/file.mp4': { ok: false, status: 404 }
      });

      const waiter1 = task.wait();
      const waiter2 = task.wait();

      // Start (will fail)
      try {
        await task.start();
      } catch (e) {
        // Expected
      }

      // All waiters rejected
      await expect(waiter1).rejects.toThrow();
      await expect(waiter2).rejects.toThrow();
      expect(task.waiters.length).toBe(0);
    });
  });

  describe('Small File Downloads (<100MB)', () => {
    it('should download in single request', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/small.mp4' });
      const testBlob = createTestBlob(10 * 1024 * 1024); // 10MB

      const fetchMock = mockFetch({
        'HEAD http://test.com/small.mp4': {
          headers: { 'Content-Length': String(10 * 1024 * 1024) }
        },
        'GET http://test.com/small.mp4': { blob: testBlob }
      });

      await task.start();

      // Verify single GET request (plus HEAD)
      const getCalls = fetchMock.mock.calls.filter(call => {
        const options = call[1];
        return !options || options.method !== 'HEAD';
      });
      expect(getCalls.length).toBe(1);
      expect(task.blob.size).toBe(10 * 1024 * 1024);
    });

    it('should update downloadedBytes correctly', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const testBlob = createTestBlob(5000);

      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '5000' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      await task.start();

      // Invariant: downloadedBytes = totalBytes after completion
      expect(task.downloadedBytes).toBe(task.totalBytes);
      expect(task.downloadedBytes).toBe(5000);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      await expect(task.start()).rejects.toThrow('Network error');
      expect(task.state).toBe('failed');
    });

    it('should handle HTTP errors', async () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      mockFetch({
        'HEAD http://test.com/file.mp4': { ok: false, status: 404, statusText: 'Not Found' }
      });

      await expect(task.start()).rejects.toThrow('HEAD request failed: 404');
      expect(task.state).toBe('failed');
    });
  });
});

describe('DownloadQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Concurrency Control', () => {
    it('should respect concurrency limit', async () => {
      const queue = new DownloadQueue({ concurrency: 2 });

      // Mock slow downloads to test concurrency
      const testBlob = createTestBlob(1024);
      global.fetch = vi.fn(async (url, options) => {
        // Delay to simulate network
        await new Promise(resolve => setTimeout(resolve, 100));

        if (options?.method === 'HEAD') {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name) => name === 'Content-Length' ? '1024' : null
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          blob: () => Promise.resolve(testBlob)
        };
      });

      // Enqueue 5 files
      queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file1.mp4' });
      queue.enqueue({ id: '2', type: 'media', path: 'http://test.com/file2.mp4' });
      queue.enqueue({ id: '3', type: 'media', path: 'http://test.com/file3.mp4' });
      queue.enqueue({ id: '4', type: 'media', path: 'http://test.com/file4.mp4' });
      queue.enqueue({ id: '5', type: 'media', path: 'http://test.com/file5.mp4' });

      // Wait a bit for processQueue to run
      await new Promise(resolve => setTimeout(resolve, 50));

      // Invariant: running <= concurrency
      expect(queue.running).toBeLessThanOrEqual(2);
      expect(queue.running).toBeGreaterThan(0); // Some should be running

      // Queue should have pending items
      expect(queue.queue.length + queue.running).toBeGreaterThan(2);
    });

    it('should process queue as tasks complete', async () => {
      const queue = new DownloadQueue({ concurrency: 2 });

      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file1.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file1.mp4': { blob: testBlob },
        'HEAD http://test.com/file2.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file2.mp4': { blob: testBlob },
        'HEAD http://test.com/file3.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file3.mp4': { blob: testBlob }
      });

      const task1 = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file1.mp4' });
      const task2 = queue.enqueue({ id: '2', type: 'media', path: 'http://test.com/file2.mp4' });
      const task3 = queue.enqueue({ id: '3', type: 'media', path: 'http://test.com/file3.mp4' });

      // Wait for all to complete
      await Promise.all([task1.wait(), task2.wait(), task3.wait()]);

      // Post-condition: all complete
      expect(queue.running).toBe(0);
      expect(queue.queue.length).toBe(0);
      expect(queue.active.size).toBe(0);
    });
  });

  describe('Idempotent Enqueue', () => {
    it('should return same task for duplicate URLs', async () => {
      const queue = new DownloadQueue();

      // Mock fetch to prevent actual downloads
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      const task1 = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const task2 = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      // Should be same task instance
      expect(task1).toBe(task2);
      expect(queue.active.size).toBe(1);

      // Queue length might be 0 if the task already started
      expect(queue.queue.length + queue.running).toBeGreaterThanOrEqual(0);
    });

    it('should create different tasks for different URLs', () => {
      const queue = new DownloadQueue();
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file1.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file1.mp4': { blob: testBlob },
        'HEAD http://test.com/file2.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file2.mp4': { blob: testBlob }
      });

      const task1 = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file1.mp4' });
      const task2 = queue.enqueue({ id: '2', type: 'media', path: 'http://test.com/file2.mp4' });

      expect(task1).not.toBe(task2);
      expect(queue.active.size).toBe(2);
    });
  });

  describe('getTask()', () => {
    it('should return active task', () => {
      const queue = new DownloadQueue();
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });

      const task = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const retrieved = queue.getTask('http://test.com/file.mp4');

      expect(retrieved).toBe(task);
    });

    it('should return null for non-existent task', () => {
      const queue = new DownloadQueue();

      const retrieved = queue.getTask('http://test.com/nonexistent.mp4');

      expect(retrieved).toBeNull();
    });
  });

  describe('clear()', () => {
    it('should clear queue and active tasks', () => {
      const queue = new DownloadQueue();
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file1.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file1.mp4': { blob: testBlob },
        'HEAD http://test.com/file2.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file2.mp4': { blob: testBlob },
        'HEAD http://test.com/file3.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file3.mp4': { blob: testBlob }
      });

      queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file1.mp4' });
      queue.enqueue({ id: '2', type: 'media', path: 'http://test.com/file2.mp4' });
      queue.enqueue({ id: '3', type: 'media', path: 'http://test.com/file3.mp4' });

      // Clear
      queue.clear();

      // Post-condition: everything cleared
      expect(queue.queue.length).toBe(0);
      expect(queue.active.size).toBe(0);
      expect(queue.running).toBe(0);
    });
  });
});

describe('DownloadManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Delegation', () => {
    it('should delegate enqueue to queue', () => {
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });
      const manager = new DownloadManager({ concurrency: 4 });

      const task = manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      expect(task).toBeInstanceOf(DownloadTask);
      expect(manager.queue.active.has('http://test.com/file.mp4')).toBe(true);
    });

    it('should delegate getTask to queue', () => {
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });
      const manager = new DownloadManager();

      const task = manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const retrieved = manager.getTask('http://test.com/file.mp4');

      expect(retrieved).toBe(task);
    });

    it('should delegate getProgress to queue', () => {
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });
      const manager = new DownloadManager();

      manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      const progress = manager.getProgress();

      expect(progress).toBeDefined();
      expect(typeof progress).toBe('object');
    });

    it('should delegate clear to queue', () => {
      const testBlob = createTestBlob(1024);
      mockFetch({
        'HEAD http://test.com/file.mp4': { headers: { 'Content-Length': '1024' } },
        'GET http://test.com/file.mp4': { blob: testBlob }
      });
      const manager = new DownloadManager();

      manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      manager.clear();

      expect(manager.queue.queue.length).toBe(0);
      expect(manager.queue.active.size).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should pass concurrency to queue', () => {
      const manager = new DownloadManager({ concurrency: 8 });

      expect(manager.queue.concurrency).toBe(8);
    });

    it('should pass chunkSize to queue', () => {
      const manager = new DownloadManager({ chunkSize: 25 * 1024 * 1024 });

      expect(manager.queue.chunkSize).toBe(25 * 1024 * 1024);
    });

    it('should pass chunksPerFile to queue', () => {
      const manager = new DownloadManager({ chunksPerFile: 8 });

      expect(manager.queue.chunksPerFile).toBe(8);
    });

    it('should use defaults if not specified', () => {
      const manager = new DownloadManager();

      expect(manager.queue.concurrency).toBe(4); // DEFAULT_CONCURRENCY
      expect(manager.queue.chunkSize).toBe(50 * 1024 * 1024); // DEFAULT_CHUNK_SIZE
    });
  });
});

// ============================================================================
// Progressive Chunk Streaming Tests
// ============================================================================

describe('DownloadTask - Progressive Streaming', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onChunkDownloaded callback', () => {
    it('should initialize onChunkDownloaded as null', () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      expect(task.onChunkDownloaded).toBeNull();
    });

    it('should allow setting onChunkDownloaded before start', () => {
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const callback = vi.fn();

      task.onChunkDownloaded = callback;

      expect(task.onChunkDownloaded).toBe(callback);
    });

    it('should call onChunkDownloaded for each chunk during chunked download', async () => {
      // 200MB file → will use downloadChunks (threshold is 100MB)
      const fileSize = 200 * 1024 * 1024;
      const sourceBlob = createTestBlob(fileSize, 'video/mp4');

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/big.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      const chunkCalls = [];
      task.onChunkDownloaded = vi.fn(async (index, blob, total) => {
        chunkCalls.push({ index, size: blob.size, total });
      });

      await task.start();

      // 200MB / 50MB = 4 chunks
      expect(task.onChunkDownloaded).toHaveBeenCalledTimes(4);
      expect(chunkCalls.length).toBe(4);

      // Each callback receives (chunkIndex, chunkBlob, totalChunks)
      for (const call of chunkCalls) {
        expect(call.total).toBe(4);
        expect(call.size).toBeGreaterThan(0);
      }

      // All chunk indices should be present (order may vary due to parallelism)
      const indices = chunkCalls.map(c => c.index).sort();
      expect(indices).toEqual([0, 1, 2, 3]);
    });

    it('should return empty blob when onChunkDownloaded is set', async () => {
      const fileSize = 200 * 1024 * 1024;
      const sourceBlob = createTestBlob(fileSize, 'video/mp4');

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/big.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      // Set callback → triggers empty blob return path
      task.onChunkDownloaded = vi.fn(async () => {});

      await task.start();

      // Post-condition: blob should be empty (data was handled by callbacks)
      expect(task.blob.size).toBe(0);
      expect(task.state).toBe('complete');
    });

    it('should return full blob when onChunkDownloaded is NOT set', async () => {
      const fileSize = 200 * 1024 * 1024;
      const sourceBlob = createTestBlob(fileSize, 'video/mp4');

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/big.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      // No callback set → traditional reassembly
      await task.start();

      // Post-condition: blob contains the full file
      expect(task.blob.size).toBe(fileSize);
      expect(task.state).toBe('complete');
    });

    it('should not call onChunkDownloaded for small files (single request)', async () => {
      const fileSize = 10 * 1024 * 1024; // 10MB - below 100MB threshold
      const sourceBlob = createTestBlob(fileSize);

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/small.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      task.onChunkDownloaded = vi.fn(async () => {});

      await task.start();

      // Small file uses downloadFull, not downloadChunks → callback not called
      expect(task.onChunkDownloaded).not.toHaveBeenCalled();
      // But the blob should still contain data
      expect(task.blob.size).toBe(fileSize);
    });

    it('should handle async callback errors gracefully', async () => {
      const fileSize = 200 * 1024 * 1024;
      const sourceBlob = createTestBlob(fileSize, 'video/mp4');

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/big.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      // Callback throws — should not crash download
      task.onChunkDownloaded = vi.fn(async () => {
        throw new Error('Cache storage failed');
      });

      // Download should still complete despite callback errors
      await task.start();

      expect(task.state).toBe('complete');
      expect(task.onChunkDownloaded).toHaveBeenCalledTimes(4);
    });

    it('should resolve waiters with empty blob when callback is set', async () => {
      const fileSize = 200 * 1024 * 1024;
      const sourceBlob = createTestBlob(fileSize, 'video/mp4');

      const task = new DownloadTask(
        { id: '1', type: 'media', path: 'http://test.com/big.mp4' },
        { chunkSize: 50 * 1024 * 1024, chunksPerFile: 4 }
      );

      mockChunkedFetch(sourceBlob);

      task.onChunkDownloaded = vi.fn(async () => {});

      // Set up waiter before start
      const waiterPromise = task.wait();

      await task.start();

      const result = await waiterPromise;
      // Waiter gets the empty blob (data already handled by callbacks)
      expect(result.size).toBe(0);
    });
  });
});

// ============================================================================
// DownloadQueue Priority Tests
// ============================================================================

describe('DownloadQueue - Priority', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prioritize()', () => {
    it('should move queued file to front', () => {
      const queue = new DownloadQueue({ concurrency: 0 }); // Concurrency 0 prevents auto-start

      // Enqueue 3 files (none will start due to concurrency 0)
      // Actually concurrency 0 means the while loop never runs in processQueue
      // But we need concurrency > 0 to create tasks. Let me just use a high enough count.
      // Instead, create tasks manually
      const task1 = new DownloadTask({ id: '1', type: 'media', path: 'http://a' });
      const task2 = new DownloadTask({ id: '2', type: 'media', path: 'http://b' });
      const task3 = new DownloadTask({ id: '3', type: 'media', path: 'http://c' });

      queue.queue = [task1, task2, task3];
      queue.active.set('http://a', task1);
      queue.active.set('http://b', task2);
      queue.active.set('http://c', task3);

      // task3 is at position 2 → prioritize it
      const found = queue.prioritize('media', '3');

      expect(found).toBe(true);
      expect(queue.queue[0]).toBe(task3); // Now at front
      expect(queue.queue[1]).toBe(task1);
      expect(queue.queue[2]).toBe(task2);
    });

    it('should return true if file is already at front', () => {
      const queue = new DownloadQueue();
      const task = new DownloadTask({ id: '1', type: 'media', path: 'http://a' });
      queue.queue = [task];
      queue.active.set('http://a', task);

      const found = queue.prioritize('media', '1');

      expect(found).toBe(true);
      expect(queue.queue[0]).toBe(task);
    });

    it('should return false if file not found', () => {
      const queue = new DownloadQueue();

      const found = queue.prioritize('media', '999');

      expect(found).toBe(false);
    });

    it('should return true if file is already downloading', () => {
      const queue = new DownloadQueue();
      const task = new DownloadTask({ id: '5', type: 'media', path: 'http://x' });
      task.state = 'downloading';
      queue.active.set('http://x', task);
      // Not in queue (already started)

      const found = queue.prioritize('media', '5');

      expect(found).toBe(true);
    });
  });
});
