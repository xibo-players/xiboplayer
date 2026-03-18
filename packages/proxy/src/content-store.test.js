// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContentStore } from './content-store.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('ContentStore', () => {
  let store;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-store-test-'));
    store = new ContentStore(tmpDir);
    store.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('put/has/get', () => {
    it('should store and retrieve a buffer', () => {
      const key = 'media/file/test.png';
      const data = Buffer.from('PNG image data');
      store.put(key, data, { contentType: 'image/png', size: data.length });

      expect(store.has(key).exists).toBe(true);
      expect(fs.existsSync(store.getPath(key))).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(store.has('media/file/nope.png').exists).toBe(false);
    });

    it('should store metadata alongside content', () => {
      const key = 'media/file/test.mp4';
      const data = Buffer.from('video data');
      store.put(key, data, { contentType: 'video/mp4', size: data.length });

      const meta = store.getMetadata(key);
      expect(meta).toBeTruthy();
      expect(meta.contentType).toBe('video/mp4');
      expect(meta.size).toBe(data.length);
    });
  });

  describe('delete', () => {
    it('should delete an existing file', () => {
      const key = 'media/file/delete-me.png';
      store.put(key, Buffer.from('data'), { contentType: 'image/png' });
      expect(store.has(key).exists).toBe(true);

      store.delete(key);
      expect(store.has(key).exists).toBe(false);
    });

    it('should not throw when deleting non-existent key', () => {
      expect(() => store.delete('media/file/nope.png')).not.toThrow();
    });
  });

  describe('chunked storage', () => {
    it('should store and detect individual chunks', () => {
      const key = 'media/file/big.mp4';
      store.putChunk(key, 0, Buffer.from('chunk0'), {});
      store.putChunk(key, 1, Buffer.from('chunk1'), {});

      expect(store.hasChunk(key, 0)).toBe(true);
      expect(store.hasChunk(key, 1)).toBe(true);
      expect(store.hasChunk(key, 2)).toBe(false);
    });

    it('should report missing chunks', () => {
      const key = 'media/file/big.mp4';
      store.putChunk(key, 0, Buffer.from('chunk0'), { numChunks: 3 });
      store.putChunk(key, 2, Buffer.from('chunk2'), {});

      const missing = store.missingChunks(key);
      // Returns array of missing chunk indices
      expect(missing).toContain(1);
      expect(missing).not.toContain(0);
      expect(missing).not.toContain(2);
    });

    it('should mark chunked file as complete', () => {
      const key = 'media/file/big.mp4';
      store.putChunk(key, 0, Buffer.from('chunk0'), {});
      store.markComplete(key);

      // After marking complete, has() should return true for the whole file
      expect(store.has(key).exists).toBe(true);
    });
  });

  describe('list', () => {
    it('should list all stored files', () => {
      store.put('media/file/a.png', Buffer.from('a'), {});
      store.put('media/file/b.png', Buffer.from('b'), {});

      const files = store.list();
      const keys = files.map(f => f.key || f.path || f);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getSize', () => {
    it('should return total size of stored content', () => {
      store.put('media/file/a.png', Buffer.from('aaaa'), { size: 4 });
      store.put('media/file/b.png', Buffer.from('bb'), { size: 2 });

      const size = store.getSize();
      expect(size).toBeGreaterThanOrEqual(6);
    });
  });
});
