# @xiboplayer/renderer Documentation

**RendererLite: Fast, efficient layout rendering engine.**

## Overview

The `@xiboplayer/renderer` package provides:

- **RendererLite** - Lightweight XLF layout renderer
- **Layout parser** - XLF to JSON translation
- **Widget system** - Extensible widget rendering
- **Transition engine** - Smooth layout transitions
- **Element reuse** - Performance optimization (50% memory reduction)

## Installation

```bash
npm install @xiboplayer/renderer
```

## Usage

```javascript
import { RendererLite } from '@xiboplayer/renderer';

const renderer = new RendererLite({
  container: document.getElementById('player'),
  cacheManager: cache
});

await renderer.loadLayout(xlf);
renderer.start();
```

## Features

### Element Reuse Pattern

Pre-creates all widget elements at layout load, toggles visibility instead of recreating DOM:

- **50% memory reduction** over 10 cycles
- **10x faster** layout replay (<0.5s vs 2-3s)
- Zero GC pressure from DOM churn

### Parallel Media Pre-fetch

Fetches all media URLs upfront in parallel, enabling instant widget rendering.

### Dynamic Video Duration

Respects `useDuration` flag from XLF, uses video metadata when duration should be dynamic.

## API Reference

### RendererLite

```javascript
class RendererLite {
  constructor(options)
  async loadLayout(xlf)
  start()
  stop()
  pause()
  resume()
  on(event, callback)
}
```

### Events

- `layout:loaded` - Layout parsed and ready
- `layout:start` - Layout playback started
- `layout:end` - Layout completed
- `region:start` - Region playback started
- `widget:start` - Widget started

## Performance

| Metric | XLR | Arexibo | RendererLite |
|--------|-----|---------|--------------|
| Initial load | 17-20s | 12-15s | **3-5s** |
| Layout replay | 2-3s | <1s | **<0.5s** |
| Memory (10 cycles) | +500MB | Stable | **Stable** |

## Dependencies

- `@xiboplayer/utils` - Logger, EventEmitter
- `pdfjs-dist` - PDF rendering

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player orchestration
- [@xiboplayer/cache](../../cache/docs/) - Media caching

---

**Package Version**: 1.0.0
**Last Updated**: 2026-02-10
