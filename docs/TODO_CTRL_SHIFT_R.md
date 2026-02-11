# TODO: Fix Ctrl+Shift+R (Hard Reload) for PWA Player

## Status: Open

## Problem

On Ctrl+Shift+R (hard reload), Firefox bypasses the Service Worker for iframe navigation requests. Widget HTML iframes (`/player/pwa/cache/widget/...`) get HTTP 404 from the server instead of being served by the SW. The CMS 404 page renders inside the widget iframes instead of widget content.

**Normal loads (fresh boot, Ctrl+R) work perfectly.** This only affects hard reload.

## Root Cause

Firefox propagates the "force reload" flag to iframe navigations but NOT to XHR/fetch from the main thread. There is no client-side API to detect this asymmetric behavior.

- `navigator.serviceWorker.controller` is NOT null on hard reload
- XHR/fetch from main thread still goes through SW (HTTP/1.1 200 0ms)
- iframe.src navigations bypass SW (HTTP/2 404 from server)

## Approaches Tried

### 1. Blob URL with rewritten local paths
- Changed `getWidgetHtml()` to return HTML string instead of `{ url }`
- Blob URL iframe sub-resources (`/player/pwa/cache/static/bundle.min.js`) can't resolve from blob context
- **Error**: `'src' attribute of <script> is not a valid URI`
- **Result**: Broke fresh boot

### 2. Blob URL with full absolute URLs (including origin)
- Changed `cacheWidgetHtml()` to use `https://displays.superpantalles.com/player/pwa/cache/static/...`
- Blob URL iframe sub-resources don't go through SW in Firefox
- **Error**: `NS_ERROR_CORRUPTED_CONTENT` (server returns CMS 404 HTML where JS expected)
- **Result**: Broke fresh boot

### 3. Check `navigator.serviceWorker.controller`
- Added check: if controller is null, use blob URL fallback with `widget.raw`
- Controller is NOT null on Ctrl+Shift+R — SW remains controller
- **Result**: Detection never triggered, Ctrl+Shift+R still broken

### 4. Onload fallback with `<base>` tag detection (current)
- Set `iframe.src = cacheUrl`, add onload handler
- Check if `iframe.contentDocument.querySelector('base')` exists
- If missing (CMS 404 page), fall back to blob URL with `widget.raw`
- **Result**: Fallback does NOT trigger — likely CMS 404 page also has a `<base>` tag
- Code is still in place (harmless on normal loads)

## Potential Future Approaches

### A. Better marker detection
- Add `<meta name="xibo-widget" content="1">` to cached widget HTML
- Check for this specific marker instead of `<base>` tag
- More reliable than checking for `<base>` which CMS 404 page may also have

### B. srcdoc approach
- Fetch cached HTML from Cache API (main thread, no SW needed)
- Set `iframe.srcdoc = htmlContent`
- **Risk**: srcdoc iframes have `about:srcdoc` origin, may not route sub-resources through SW
- Would need full absolute URLs and testing

### C. Pre-load fetch probe
- Before setting iframe.src, fetch the cache URL from main thread
- If response differs from cache (or check response header), detect hard reload
- **Challenge**: fetch ALWAYS goes through SW, so it always succeeds, can't distinguish reload type

### D. Performance API detection
- Check `performance.getEntriesByType('navigation')[0]` for reload indicators
- `transferSize > 0` might indicate hard reload but also occurs on soft reload

### E. Accept the limitation
- Ctrl+Shift+R is a developer action, not a production scenario
- Digital signage players auto-reload via XMR or collection cycle, never hard reload
- Document as known limitation

## Current State (2026-02-11)

- **Fresh boot**: Working perfectly
- **Ctrl+R (soft reload)**: Working perfectly
- **Ctrl+Shift+R (hard reload)**: Shows CMS 404 page in widget iframes
- **Code**: Onload fallback code (approach 4) is deployed but inactive. Harmless on normal loads.

## Files Involved

- `packages/renderer/src/renderer-lite.js` (lines 1084-1104, 1221-1241) — onload fallback handler
- `platforms/pwa/src/main.ts` (lines ~114-142) — `getWidgetHtml()` returns `{ url, fallback }`
- `packages/cache/src/cache.js` (lines ~381-467) — `cacheWidgetHtml()` with static resource caching
- `platforms/pwa/public/sw.js` — static resource handler (unchanged)
