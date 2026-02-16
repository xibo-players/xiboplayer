# @xiboplayer/cache Documentation

**Offline caching and download management with parallel chunk downloads.**

## Overview

The `@xiboplayer/cache` package provides:

- **CacheManager** - IndexedDB-based media storage
- **CacheProxy** - Service Worker integration
- **DownloadManager** - Parallel chunk downloads (4x faster)

## Installation

```bash
npm install @xiboplayer/cache
```

## Usage

```javascript
import { CacheManager, DownloadManager } from '@xiboplayer/cache';

// Initialize cache
const cache = new CacheManager();
await cache.initialize();

// Download with parallel chunks
const downloader = new DownloadManager(cache);
await downloader.downloadFile(url, { chunkSize: 1024 * 1024 });

// Retrieve from cache
const blob = await cache.get(url);
```

## Features

### Parallel Chunk Downloads

Downloads large files in 4 concurrent chunks (configurable), achieving 2-4x speed improvement over sequential downloads.

```javascript
const CONCURRENT_CHUNKS = 4; // Adjust 2-6 based on network
```

### Cache Validation

Automatically validates cached entries:
- Content-Type verification
- Size validation (> 100 bytes)
- Corrupted entry detection

### Blob URL Lifecycle

Proper blob URL management prevents memory leaks:
- Layout-scoped tracking
- Automatic revocation on layout switch
- Media URL cleanup

## API Reference

### CacheManager

```javascript
class CacheManager {
  async initialize()
  async get(key)
  async set(key, blob)
  async has(key)
  async delete(key)
  async clear()
  async getSize()
}
```

### DownloadManager

```javascript
class DownloadManager {
  constructor(cacheManager, options)
  async downloadFile(url, options)
  async downloadBatch(urls)
  getProgress(url)
}
```

### CacheProxy

```javascript
class CacheProxy {
  constructor(cacheManager)
  register(serviceWorkerUrl)
  unregister()
  update()
}
```

## Performance

| Operation | Time |
|-----------|------|
| 1GB file download | 1-2 min (vs 5 min sequential) |
| Cache lookup | <10ms |
| Cache write | <50ms |

## Dependencies

- `@xiboplayer/utils` - Logger, EventEmitter

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player core
- [@xiboplayer/sw](../../sw/docs/) - Service Worker toolkit

---

**Package Version**: 1.0.0
**Last Updated**: 2026-02-10
