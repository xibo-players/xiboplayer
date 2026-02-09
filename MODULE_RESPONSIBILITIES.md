# PWA Player - Module Responsibilities

## Architecture Overview

Clean separation of concerns with clear module boundaries and single responsibilities.

## Service Worker Modules (sw.js)

### 1. CacheManager
**Responsibility:** Storage format abstraction
**Owns:**
- Cache API operations (get, put, delete)
- Storage format knowledge (whole files vs chunks)
- Chunk storage operations (putChunked, getChunk)
- File existence detection (fileExists, getMetadata)

**Does NOT:**
- Make HTTP requests
- Know about downloads
- Handle routing logic
- Know about video playback

**Interface:**
```javascript
async get(cacheKey) → Response|null
async put(cacheKey, blob, contentType) → void
async putChunked(cacheKey, blob, contentType) → void
async fileExists(cacheKey) → {exists, chunked, metadata}
async getChunk(cacheKey, index) → Response|null
```

### 2. BlobCache
**Responsibility:** In-memory blob caching with LRU eviction
**Owns:**
- Blob lifecycle in memory
- LRU eviction policy
- Memory limit enforcement

**Does NOT:**
- Access Cache API directly
- Know about file formats
- Handle downloads

**Interface:**
```javascript
async get(cacheKey, loader) → Blob
evictLRU() → void
clear() → void
getStats() → {entries, bytes, maxBytes, utilization}
```

### 3. RequestHandler
**Responsibility:** Fetch event handling and request routing
**Owns:**
- HTTP request routing logic
- Handler selection (whole file vs chunks, HEAD vs GET vs Range)
- Response generation for all request types
- Download-in-progress handling

**Does NOT:**
- Store files (delegates to CacheManager)
- Download files (delegates to DownloadManager)
- Know storage format details (asks CacheManager)

**Interface:**
```javascript
async handleRequest(event) → Response
async routeFileRequest(cacheKey, method, rangeHeader) → route
async handleHeadWhole(size) → Response
async handleHeadChunked(metadata) → Response
async handleRangeRequest(cached, rangeHeader, cacheKey) → Response
async handleChunkedRangeRequest(cacheKey, rangeHeader, metadata) → Response
```

### 4. MessageHandler
**Responsibility:** Client communication and download coordination
**Owns:**
- postMessage protocol
- Download request handling
- Cache clearing commands
- Download progress reporting

**Does NOT:**
- Fetch files directly (delegates to DownloadManager)
- Store files directly (delegates to CacheManager)
- Decide routing (that's RequestHandler)

**Interface:**
```javascript
async handleMessage(event) → result
async handleDownloadFiles(files) → {success, enqueuedCount, ...}
async handleClearCache() → {success}
async handleGetProgress() → {success, progress}
```

### 5. DownloadManager / DownloadQueue
**Responsibility:** Download execution and concurrency control
**Owns:**
- HTTP download operations
- Chunk downloading within files
- Concurrency limits
- Download queue management
- Progress tracking

**Does NOT:**
- Store downloaded files (returns blob to caller)
- Know about cache keys or storage formats
- Handle request routing

**Interface:**
```javascript
enqueue(file) → DownloadTask
getTask(url) → DownloadTask|null
getProgress() → {[url]: {downloaded, total, percent, state}}
```

## Page-Side Modules

### 6. CacheProxy (cache-proxy.js)
**Responsibility:** Service Worker communication abstraction
**Owns:**
- SW message protocol
- SW readiness synchronization (SW_READY events)
- Cache existence checks (hasFile via HEAD requests)

**Does NOT:**
- Access Cache API directly (that's SW's job)
- Know about storage formats (asks SW via HEAD)
- Handle rendering

**Interface:**
```javascript
async init() → void
async hasFile(type, id) → boolean
async requestDownload(files) → void
```

### 7. PlayerCore (player-core.js)
**Responsibility:** Business logic and lifecycle orchestration
**Owns:**
- Collection cycle timing
- Schedule management
- Layout dependency tracking
- File ready notifications
- Download prioritization

**Does NOT:**
- Render layouts (delegates to Renderer)
- Download files (delegates to CacheProxy)
- Store files (delegates to cache layer)

**Interface:**
```javascript
async collect() → void
notifyMediaReady(fileId, fileType) → void
setPendingLayout(layoutId, requiredMediaIds) → void
prioritizeFilesByLayout(files, layouts) → sortedFiles
```

### 8. RendererLite (renderer-lite.js)
**Responsibility:** DOM rendering and widget lifecycle
**Owns:**
- Layout parsing and rendering
- Widget element creation and reuse
- Media element lifecycle (video/audio play/pause)
- Transitions and animations
- Blob URL lifecycle (if used)

**Does NOT:**
- Download files (uses getMediaUrl callback)
- Store files (gets URLs from cache)
- Know about chunk storage

**Interface:**
```javascript
async renderLayout(xlfXml, layoutId) → void
findMediaElement(element, tagName) → HTMLElement|null
updateMediaElement(element, widget) → void
```

### 9. PwaPlayer (main.ts)
**Responsibility:** Platform integration and glue code
**Owns:**
- Component initialization
- Event wiring between modules
- Media URL resolution (streaming URLs)
- Platform-specific UI updates

**Does NOT:**
- Render layouts directly (delegates to RendererLite)
- Download files directly (delegates to CacheProxy)
- Business logic (delegates to PlayerCore)

**Interface:**
```javascript
async init() → void
checkAllMediaCached(mediaIds) → boolean
prefetchWidgetDependencies() → void
```

## Utility Modules

### 10. sw-utils.js
**Responsibility:** Shared utility functions
**Owns:**
- File size formatting (formatBytes)
- Range header parsing (parseRangeHeader)
- Chunk calculations (getChunksForRange, getChunkBoundaries)
- Response header creation (createMediaHeaders)
- Error response creation (createErrorResponse)
- Cache key builders (CacheKey.*)

**Does NOT:**
- Have state
- Access external APIs
- Know about specific modules

### 11. Logger (logger.js)
**Responsibility:** Configurable logging abstraction
**Owns:**
- Log level filtering
- Component-specific loggers
- Console output formatting

**Does NOT:**
- Have business logic
- Store logs persistently
- Send logs to remote services

## Module Dependency Graph

```
┌─────────────────────────────────────────────┐
│ PwaPlayer (main.ts)                         │
│ - Platform integration                      │
│ - Component wiring                          │
└─────────────────────────────────────────────┘
         ↓ uses                    ↓ uses
┌──────────────────┐      ┌──────────────────┐
│ PlayerCore       │      │ RendererLite     │
│ - Business logic │      │ - DOM rendering  │
└──────────────────┘      └──────────────────┘
         ↓ uses                    ↑ callbacks
┌─────────────────────────────────────────────┐
│ CacheProxy (cache-proxy.js)                 │
│ - SW communication                          │
└─────────────────────────────────────────────┘
         ↓ postMessage / fetch
┌─────────────────────────────────────────────┐
│ Service Worker (sw.js)                      │
│  ├─ RequestHandler - Routing               │
│  ├─ MessageHandler - Communication         │
│  ├─ CacheManager - Storage                 │
│  ├─ BlobCache - Memory management          │
│  └─ DownloadManager - Downloads            │
└─────────────────────────────────────────────┘
         ↓ uses
┌─────────────────────────────────────────────┐
│ Utilities (sw-utils.js, logger.js)          │
│ - Pure functions, no state                 │
└─────────────────────────────────────────────┘
```

## Responsibility Violations to Avoid

**❌ Anti-patterns (Don't do these):**

1. **CacheManager making HTTP requests**
   - Violates: Storage abstraction
   - Instead: Return results, let caller decide

2. **RequestHandler storing files**
   - Violates: Single responsibility
   - Instead: Call cacheManager.put()

3. **RendererLite downloading files**
   - Violates: Separation of concerns
   - Instead: Use getMediaUrl callback

4. **PlayerCore accessing DOM**
   - Violates: Business logic purity
   - Instead: Emit events, let renderer handle

5. **Duplicate logic across modules**
   - Violates: DRY principle
   - Instead: Extract to utilities

## Testing Boundaries

**Each module should be testable independently:**

- **CacheManager:** Mock Cache API
- **BlobCache:** No mocks needed (pure logic)
- **RequestHandler:** Mock CacheManager, BlobCache
- **DownloadManager:** Mock fetch
- **PlayerCore:** Mock XMDS, schedule
- **RendererLite:** Mock DOM, options

## Benefits of Clear Responsibilities

1. **Testability:** Mock dependencies, test in isolation
2. **Maintainability:** Changes localized to single module
3. **Debuggability:** Clear ownership of logs and errors
4. **Extensibility:** Add features without cross-module changes
5. **Code review:** Clear what each PR should touch

## Current Status

**✅ Clean separation achieved:**
- Each module has single, clear responsibility
- No cross-cutting concerns
- Utilities extracted for shared logic
- Logging centralized but scoped by component

**✅ All modules following their contracts:**
- CacheManager: Storage only
- RequestHandler: Routing only
- MessageHandler: Communication only
- DownloadManager: Downloads only
- PlayerCore: Business logic only
- RendererLite: Rendering only

**The architecture is clean, modular, and maintainable!** 🎯
