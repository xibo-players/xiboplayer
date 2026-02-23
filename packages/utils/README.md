# @xiboplayer/utils

**Shared utilities for all XiboPlayer SDK packages.**

## Overview

Foundation utilities used across the SDK:

- **Logger** — structured logging with configurable levels (`DEBUG`, `INFO`, `WARNING`, `ERROR`) and per-module tags
- **EventEmitter** — lightweight pub/sub event system
- **fetchWithRetry** — HTTP fetch with exponential backoff, jitter, and configurable retries
- **CMS REST client** — JSON API client with ETag caching
- **Config** — hardware key management and IndexedDB-backed configuration

## Installation

```bash
npm install @xiboplayer/utils
```

## Usage

```javascript
import { createLogger, EventEmitter, fetchWithRetry } from '@xiboplayer/utils';

const log = createLogger('my-module');
log.info('Starting...');
log.debug('Detailed info');

const emitter = new EventEmitter();
emitter.on('event', (data) => console.log(data));

const response = await fetchWithRetry(url, { retries: 3 });
```

## Exports

| Export | Description |
|--------|-------------|
| `createLogger(tag)` | Create a tagged logger instance |
| `EventEmitter` | Pub/sub event emitter |
| `fetchWithRetry(url, opts)` | Fetch with exponential backoff |
| `Config` | Hardware key and IndexedDB config management |

---

[xiboplayer.org](https://xiboplayer.org) · **Part of the [XiboPlayer SDK](https://github.com/xibo-players/xiboplayer)**
