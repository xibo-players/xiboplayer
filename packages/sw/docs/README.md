# @xiboplayer/sw Documentation

**Service Worker toolkit for chunk streaming and offline caching.**

## Overview

Provides Service Worker utilities for:

- **Chunk streaming** - Progressive media download
- **Cache-first strategy** - Fast offline access
- **Background sync** - Resilient updates
- **Update mechanism** - Seamless SW updates

## Installation

```bash
npm install @xiboplayer/sw
```

## Usage

```javascript
// In main thread
import { registerServiceWorker } from '@xiboplayer/sw';

await registerServiceWorker('/sw.js');

// In service worker
import { setupChunkStreaming } from '@xiboplayer/sw/worker';

self.addEventListener('install', event => {
  event.waitUntil(setupChunkStreaming());
});
```

## Features

- HTTP 206 Partial Content support
- Automatic range request handling
- Cache API integration
- Update notifications

## API Reference

### registerServiceWorker(url)

Registers Service Worker with update handling.

### setupChunkStreaming()

Configures SW for chunk-based streaming.

## Dependencies

None (zero dependencies)

## Related Packages

- [@xiboplayer/cache](../../cache/docs/) - Cache management

---

**Package Version**: 1.0.0
