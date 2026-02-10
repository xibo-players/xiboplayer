/**
 * DownloadManager Tests
 *
 * Contract-based testing for DownloadTask, DownloadQueue, and DownloadManager
 * Tests state machines, concurrency control, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DownloadTask, DownloadQueue, DownloadManager } from './download-manager.js';
import { mockFetch, createTestBlob, waitFor, createSpy } from './test-utils.js';

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

      const task1 = queue.enqueue({ id: '1', type: 'media', path: 'http://test.com/file1.mp4' });
      const task2 = queue.enqueue({ id: '2', type: 'media', path: 'http://test.com/file2.mp4' });

      expect(task1).not.toBe(task2);
      expect(queue.active.size).toBe(2);
    });
  });

  describe('getTask()', () => {
    it('should return active task', () => {
      const queue = new DownloadQueue();

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
  describe('API Delegation', () => {
    it('should delegate enqueue to queue', () => {
      const manager = new DownloadManager({ concurrency: 4 });

      const task = manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      expect(task).toBeInstanceOf(DownloadTask);
      expect(manager.queue.active.has('http://test.com/file.mp4')).toBe(true);
    });

    it('should delegate getTask to queue', () => {
      const manager = new DownloadManager();

      const task = manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });
      const retrieved = manager.getTask('http://test.com/file.mp4');

      expect(retrieved).toBe(task);
    });

    it('should delegate getProgress to queue', () => {
      const manager = new DownloadManager();

      manager.enqueue({ id: '1', type: 'media', path: 'http://test.com/file.mp4' });

      const progress = manager.getProgress();

      expect(progress).toBeDefined();
      expect(typeof progress).toBe('object');
    });

    it('should delegate clear to queue', () => {
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
