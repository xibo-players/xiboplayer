# PWA Player - Offline-First Kiosk Mode

**Priority**: 🔴 **CRITICAL** (Rule #1 for kiosk deployment)
**Status**: 🔧 In Progress
**Date**: 2026-02-06

---

## Requirements

### Kiosk Operating Constraints

1. **Offline Operation** (Primary)
   - Must work without network connection
   - All resources pre-downloaded
   - No on-demand fetching during playback
   - Graceful degradation if network unavailable

2. **Resource Management**
   - Download everything during collection (when network available)
   - Cache forever (no eviction)
   - Prevent unnecessary network requests
   - Optimize for bandwidth-limited scenarios

3. **Update Mechanism**
   - XMR WebSocket notifications (primary)
   - XMDS polling (fallback, configurable interval)
   - Background sync when network available
   - No interruption to playback

---

## Current Status Analysis

### ✅ What Works Offline

1. **Layout rendering** - XLF cached, plays offline
2. **Media playback** - Videos/images cached, play offline
3. **Widget HTML** - Cached after first fetch
4. **Element reuse** - No network needed for replay

### ❌ What Requires Network (Problems)

1. **Widget dependencies** - bundle.min.js, fonts.css loaded on-demand
2. **Service Worker** - Currently DISABLED (line 32-35 in main.ts)
3. **Widget HTML updates** - Fetched from server each time
4. **Resource files** - Some widgets fetch external resources

---

## Implementation Plan

### Phase 1: Widget Dependency Pre-caching ✅ DONE

**Implemented**: prefetchWidgetDependencies() in main.ts

```typescript
private async prefetchWidgetDependencies() {
  const dependencies = [
    { type: 'P', itemId: '1', fileType: 'bundle', filename: 'bundle.min.js' },
    { type: 'P', itemId: '1', fileType: 'fontCss', filename: 'fonts.css' }
  ];

  // Fetch and cache all dependencies in parallel
  await Promise.all(dependencies.map(async (dep) => {
    // Check cache first
    // If not cached, fetch from server
    // Store in cache for offline use
  }));
}
```

**Called**: Before fetchWidgetHtml() (lines 298, 540)

**Result**: Eliminates 11.5s delay for text widgets ✅

---

### Phase 2: Service Worker Re-enablement (CRITICAL)

**Current State**: Service Worker DISABLED (main.ts:32-35)

```typescript
// Service Worker disabled - causes HTTP 202 caching issues with chunked downloads
// The SW intercepts fetch() and returns stale "Accepted" responses
// TODO: Fix Service Worker to not cache 202 responses, then re-enable
console.log('[PWA] Service Worker disabled (bypassing for direct network access)');
```

**Problem**: Without Service Worker:
- No offline capability
- No background sync
- Network always required

**Solution**: Fix Service Worker to handle chunked downloads correctly

**Implementation needed**:

1. Update `sw.js` to NOT cache HTTP 202 responses:
```javascript
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Check if stale 202 response
        if (cachedResponse.status === 202) {
          // Re-fetch from network
          return fetch(event.request);
        }
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // DON'T cache 202 responses
        if (response.status === 202) {
          return response; // Pass through, don't cache
        }

        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return response;
      });
    })
  );
});
```

2. Enable Service Worker registration in main.ts:
```typescript
// Register Service Worker for offline capability
if ('serviceWorker' in navigator) {
  try {
    await navigator.serviceWorker.register('/player/pwa/sw.js');
    console.log('[PWA] Service Worker registered for offline mode');
  } catch (error) {
    console.warn('[PWA] Service Worker registration failed:', error);
  }
}
```

---

### Phase 3: Complete Resource Download

**Goal**: Download ALL required resources during collection, nothing on-demand

**Current Collection** (main.ts:211-333):
```typescript
async collect() {
  // 1. Register display ✅
  // 2. RequiredFiles ✅ Downloads layouts and media
  // 3. Schedule ✅ Gets layout list
  // 4. fetchWidgetHtml ✅ Downloads widget HTML
  // 5. prefetchWidgetDependencies ✅ NEW - Downloads bundle.min.js, fonts.css
}
```

**Still Missing**:
- Widget-specific resources (fonts, images referenced in widget HTML)
- External resources (if any widgets use external URLs)

**Solution**: Parse widget HTML for resource references

```typescript
private async prefetchWidgetResources(html: string, layoutId: number, widgetId: string) {
  // Parse HTML for resource references
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Find all resource URLs
  const resources = [];

  // Scripts
  doc.querySelectorAll('script[src]').forEach(script => {
    resources.push({ type: 'script', url: script.src });
  });

  // Stylesheets
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    resources.push({ type: 'style', url: link.href });
  });

  // Images
  doc.querySelectorAll('img[src]').forEach(img => {
    resources.push({ type: 'image', url: img.src });
  });

  // Fetch and cache all resources
  const cache = await caches.open('xibo-media-v1');
  await Promise.all(resources.map(async (res) => {
    try {
      const response = await fetch(res.url);
      if (response.ok) {
        await cache.put(res.url, response);
      }
    } catch (error) {
      console.warn(`[PWA] Failed to prefetch widget resource: ${res.url}`);
    }
  }));
}
```

---

### Phase 4: Offline Detection and Graceful Degradation

**Implementation**:

```typescript
// Detect offline mode
private isOnline(): boolean {
  return navigator.onLine;
}

// Collection with offline handling
async collect() {
  if (!this.isOnline()) {
    console.log('[PWA] Offline mode - using cached data');
    // Skip network requests, use cached schedule/layouts
    return;
  }

  // Normal collection when online
  // ...
}

// Listen for online/offline events
window.addEventListener('online', () => {
  console.log('[PWA] Network restored - triggering collection');
  this.collect();
});

window.addEventListener('offline', () => {
  console.log('[PWA] Network lost - entering offline mode');
  // Continue playback with cached resources
});
```

---

### Phase 5: Cache Persistence

**Current**: Cache can be evicted by browser

**Goal**: Mark cache as persistent

```typescript
// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
  const persistent = await navigator.storage.persist();
  if (persistent) {
    console.log('[PWA] Cache marked as persistent (won't be evicted)');
  } else {
    console.warn('[PWA] Cache persistence not granted');
  }
}

// Check quota
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log(`[PWA] Storage: ${(estimate.usage / 1024 / 1024).toFixed(1)}MB / ${(estimate.quota / 1024 / 1024).toFixed(1)}MB`);
}
```

---

## Recommended Architecture

### Offline-First Collection Cycle

```
Network Available:
  ├─ Register display
  ├─ RequiredFiles → Download ALL media/layouts
  ├─ Schedule → Get layout list
  ├─ For each layout:
  │   ├─ Download XLF
  │   ├─ Fetch widget HTML (parallel)
  │   ├─ Pre-fetch widget dependencies (bundle.min.js, fonts.css)
  │   ├─ Pre-fetch widget resources (images, fonts in HTML)
  │   └─ Cache everything
  └─ Mark ready for offline

Network Unavailable:
  ├─ Load schedule from cache
  ├─ Load layouts from cache
  ├─ Play with cached resources
  └─ Queue updates for when network returns
```

---

## Implementation Priority

### Immediate (Tonight) ✅

1. ✅ Pre-fetch widget dependencies (bundle.min.js, fonts.css)
   - Eliminates 11.5s delay
   - Status: Implemented

### High Priority (Next)

2. **Fix and enable Service Worker**
   - Skip HTTP 202 responses
   - Enable offline mode
   - Critical for kiosk operation

3. **Persistent storage request**
   - Prevent cache eviction
   - Essential for offline kiosk

### Medium Priority

4. **Widget resource pre-fetching**
   - Parse HTML for resource URLs
   - Download during collection
   - Complete offline capability

5. **Offline mode detection**
   - Handle network loss gracefully
   - Continue playback offline
   - Queue updates

---

## Testing Checklist

### Offline Mode Test

1. **Initial Load** (with network):
   - Clear cache
   - Load player
   - Verify: All resources downloaded
   - Check: bundle.min.js cached

2. **Offline Operation**:
   - Disconnect network
   - Reload player
   - Verify: Plays from cache
   - Check: No network requests

3. **Reconnection**:
   - Restore network
   - Verify: Collection cycle runs
   - Check: Updates downloaded
   - Verify: Playback continues

---

## Current Status

**Implemented**:
- ✅ Widget dependency pre-fetch (eliminates 11.5s delay)
- ✅ Widget HTML caching
- ✅ Media caching
- ✅ Layout caching

**Still Needed for Full Offline**:
- ⚠️ Service Worker enablement
- ⚠️ Persistent storage request
- ⚠️ Widget resource pre-fetching
- ⚠️ Offline mode detection

---

## Next Steps

1. Deploy current fix (widget dependency pre-fetch)
2. Test: Verify text widgets load instantly
3. Implement Service Worker fix
4. Enable persistent storage
5. Test offline mode thoroughly

---

**Priority**: This work should be completed ASAP for kiosk deployment
