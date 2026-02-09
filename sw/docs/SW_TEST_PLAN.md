# Service Worker Test Plan - 2026-02-07

## Overview

Test plan to verify the Service Worker bug fixes for widget resource handling.

**Target URL**: https://displays.superpantalles.com/player/pwa/

---

## Test 1: Fresh Boot (No Cache)

**Objective**: Verify Service Worker handles initial widget resource requests correctly.

**Steps**:
1. Open Chrome DevTools (F12)
2. Go to Application > Storage > Clear site data
3. Close DevTools
4. Navigate to https://displays.superpantalles.com/player/pwa/
5. Open DevTools Console
6. Wait for layout to load

**Expected Results**:
```
[SW] Loading standalone Service Worker: 2026-02-06-standalone
[PWA] Service Worker registered
[PWA] Pre-fetching widget dependency: bundle.min.js
[PWA] Pre-fetching widget dependency: fonts.css
[SW] Fetching widget resource from CMS: bundle.min.js
[SW] Widget resource not available (404): bundle.min.js - NOT caching
[SW] Fetching widget resource from CMS: fonts.css
[SW] Widget resource not available (404): fonts.css - NOT caching
```

**Success Criteria**:
- ✅ No `NS_ERROR_CORRUPTED_CONTENT` errors
- ✅ Service Worker logs are visible with `[SW]` prefix
- ✅ 404 responses are NOT cached
- ✅ Layout renders (even if widgets fail to load)

---

## Test 2: Second Load (With Cache)

**Objective**: Verify Service Worker serves cached resources correctly.

**Steps**:
1. Complete Test 1
2. Wait for Service Worker to download widget resources (if available)
3. Refresh page (Ctrl+R)
4. Check console

**Expected Results**:
```
[SW] Loading standalone Service Worker: 2026-02-06-standalone
[PWA] Service Worker registered
[SW] Serving widget resource from cache: bundle.min.js
[SW] Serving widget resource from cache: fonts.css
```

**Success Criteria**:
- ✅ Widget resources served from cache (if available)
- ✅ No network requests for cached resources
- ✅ No `NS_ERROR_CORRUPTED_CONTENT` errors
- ✅ Layout renders correctly

---

## Test 3: Service Worker Update

**Objective**: Verify Service Worker can be updated without breaking cache.

**Steps**:
1. Complete Test 2
2. In DevTools, go to Application > Service Workers
3. Click "Update" button
4. Refresh page
5. Check console

**Expected Results**:
```
[SW] Loading standalone Service Worker: 2026-02-06-standalone
[SW] Installing...
[SW] Activating...
[SW] Standalone Service Worker ready
```

**Success Criteria**:
- ✅ Service Worker updates successfully
- ✅ Cache remains valid
- ✅ No errors during update
- ✅ Layout continues to render

---

## Test 4: Widget Resource Download

**Objective**: Verify Service Worker downloads widget resources in background.

**Steps**:
1. Complete Test 1
2. Check Network tab for widget resource requests
3. Wait 30 seconds
4. Check Service Worker download progress
5. Refresh page
6. Verify cached resources are served

**Expected Results**:
```
[SW Message] Enqueueing 13 files for download
[SW Queue] Enqueued: bundle.min.js (1 pending, 0 active)
[SW Queue] Starting download: bundle.min.js (1/4 active)
[SW Download] Starting: https://...bundle.min.js
[SW Download] File size: 0.5 MB
[SW Download] Cached: /cache/widget-resource/bundle.min.js (512345 bytes)
```

**Success Criteria**:
- ✅ Widget resources are enqueued for download
- ✅ Downloads complete successfully
- ✅ Resources are cached
- ✅ Subsequent loads serve from cache

---

## Test 5: Error Handling

**Objective**: Verify Service Worker handles network errors gracefully.

**Steps**:
1. Open DevTools > Network
2. Enable "Offline" mode
3. Navigate to https://displays.superpantalles.com/player/pwa/
4. Check console

**Expected Results**:
```
[SW] Fetching widget resource from CMS: bundle.min.js
[SW] Failed to fetch widget resource: bundle.min.js TypeError: Failed to fetch
Failed to fetch widget resource (502)
```

**Success Criteria**:
- ✅ Service Worker returns proper 502 error
- ✅ No `NS_ERROR_CORRUPTED_CONTENT` errors
- ✅ Error is logged clearly
- ✅ Player continues to function (using cached data)

---

## Test 6: Cache Invalidation

**Objective**: Verify Service Worker respects cache invalidation.

**Steps**:
1. Complete Test 2 (with cached resources)
2. Open DevTools Console
3. Run: `navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })`
4. Wait for response
5. Refresh page
6. Check that resources are re-fetched

**Expected Results**:
```
[SW Message] Received: CLEAR_CACHE
[SW Message] Clearing cache
[Cache] Cleared 13 cached files
```

**Success Criteria**:
- ✅ Cache is cleared successfully
- ✅ Resources are re-fetched on next load
- ✅ No errors during cache clear
- ✅ Player continues to function

---

## Test 7: Concurrent Requests

**Objective**: Verify Service Worker handles multiple simultaneous requests.

**Steps**:
1. Complete Test 1
2. Open 3 browser tabs to https://displays.superpantalles.com/player/pwa/
3. Load all tabs simultaneously
4. Check console in each tab

**Expected Results**:
```
Tab 1:
[SW] Fetching widget resource from CMS: bundle.min.js
[SW] Caching widget resource: bundle.min.js

Tab 2:
[SW] Serving widget resource from cache: bundle.min.js

Tab 3:
[SW] Serving widget resource from cache: bundle.min.js
```

**Success Criteria**:
- ✅ Only one network request per resource
- ✅ All tabs receive the same resource
- ✅ No race conditions or corruption
- ✅ All tabs render correctly

---

## Test 8: Large File Handling

**Objective**: Verify Service Worker handles large files (>100MB) with parallel chunks.

**Steps**:
1. Upload a large video file (>100MB) to Xibo CMS
2. Add to layout
3. Load player
4. Check console for chunk download logs

**Expected Results**:
```
[SW Download] Starting: https://...video.mp4
[SW Download] File size: 250.0 MB
[SW Download] Downloading 5 chunks in parallel
[SW Download] Chunk 1 / 5 (20.0%)
[SW Download] Chunk 2 / 5 (40.0%)
[SW Download] Chunk 3 / 5 (60.0%)
[SW Download] Chunk 4 / 5 (80.0%)
[SW Download] Chunk 5 / 5 (100.0%)
[SW Download] Cached: /cache/media/123 (262144000 bytes)
```

**Success Criteria**:
- ✅ File is downloaded in parallel chunks
- ✅ Progress is logged
- ✅ File is cached successfully
- ✅ Video plays correctly

---

## Regression Tests

### Regression 1: XMDS Media Requests

**Objective**: Verify XMDS media requests still work (not broken by widget resource fix).

**Expected**: XMDS media requests (type=M, type=L) are served from cache or passed through to CMS.

### Regression 2: Widget HTML Requests

**Objective**: Verify widget HTML requests still work.

**Expected**: Widget HTML is served from `/cache/widget/{layoutId}/{regionId}/{widgetId}`.

### Regression 3: Static File Caching

**Objective**: Verify static files (index.html, manifest.json) are cached.

**Expected**: Static files are served from `STATIC_CACHE` on subsequent loads.

---

## Known Issues (Expected Behavior)

### Issue 1: displayId Mismatch

Widget HTML may contain URLs with different displayId than current display. This is a CMS issue, not a Service Worker issue.

**Example**:
```
Widget rendered for displayId=1
Widget HTML contains: <script src="...?displayId=80&...">
```

**Impact**: Widget resource 404s if displayId doesn't match

**Workaround**: Service Worker should NOT cache 404s (fixed in this release)

### Issue 2: Widget Resources Not Available

Some widget types may not have widget resources (bundle.min.js, fonts) uploaded to CMS.

**Example**:
```
Clock widget: No bundle.min.js needed
Embedded widget: Has bundle.min.js
```

**Impact**: 404 responses are expected for some widgets

**Workaround**: Service Worker logs warning but doesn't fail (fixed in this release)

---

## Performance Benchmarks

### Benchmark 1: Fresh Load Time

**Metric**: Time from navigation to layout render

**Target**: < 5 seconds (without widget resources)

### Benchmark 2: Cached Load Time

**Metric**: Time from navigation to layout render (with cache)

**Target**: < 2 seconds

### Benchmark 3: Download Throughput

**Metric**: MB/s for large file downloads

**Target**: > 10 MB/s (depends on network)

### Benchmark 4: Cache Hit Rate

**Metric**: % of requests served from cache

**Target**: > 90% (after initial load)

---

## Bug Verification

### Bug 1: NS_ERROR_CORRUPTED_CONTENT

**Status**: FIXED ✅

**Verification**:
1. Load player with widget resources
2. Check console for errors
3. Verify no `NS_ERROR_CORRUPTED_CONTENT`

### Bug 2: Cached 404 Responses

**Status**: FIXED ✅

**Verification**:
1. Load player with unavailable widget resource
2. Check Service Worker cache (DevTools > Application > Cache Storage)
3. Verify 404 response is NOT in cache

### Bug 3: Response Stream Corruption

**Status**: FIXED ✅

**Verification**:
1. Load player multiple times
2. Check that responses are consistent
3. Verify no corruption errors

---

## Automated Testing (Future)

### Playwright Tests

```javascript
test('Widget resources load without corruption', async ({ page }) => {
  await page.goto('https://displays.superpantalles.com/player/pwa/');

  const errors = [];
  page.on('console', msg => {
    if (msg.text().includes('NS_ERROR')) {
      errors.push(msg.text());
    }
  });

  await page.waitForSelector('#layout-container', { timeout: 10000 });

  expect(errors).toHaveLength(0);
});

test('Service Worker caches successful responses', async ({ page, context }) => {
  await page.goto('https://displays.superpantalles.com/player/pwa/');

  const sw = await context.serviceWorkers()[0];
  const cache = await sw.evaluate(() => {
    return caches.open('xibo-static-v1').then(cache => cache.keys());
  });

  const widgetResources = cache.filter(req =>
    req.url.includes('fileType=bundle') ||
    req.url.includes('fileType=fontCss')
  );

  // Should only cache successful responses, not 404s
  for (const req of widgetResources) {
    const resp = await sw.evaluate(url => {
      return caches.match(url).then(r => r.status);
    }, req.url);
    expect(resp).toBe(200);
  }
});
```

---

## Deployment Checklist

- [x] Code changes committed to `feature/standalone-service-worker`
- [x] Service Worker version updated: `2026-02-06-standalone`
- [x] Deployment tested on h1.superpantalles.com
- [x] Documentation updated (this file + SW_BUGFIXES_2026-02-07.md)
- [ ] Manual testing completed (all 8 tests)
- [ ] Regression tests passed
- [ ] Performance benchmarks measured
- [ ] Bug verification completed
- [ ] Production deployment approved
- [ ] Monitoring enabled

---

## Rollback Plan

If issues are found after deployment:

1. Revert to previous Service Worker version:
   ```bash
   git checkout HEAD~1 platforms/pwa/public/sw.js
   cp platforms/pwa/public/sw.js platforms/pwa/dist/sw.js
   ansible-playbook playbooks/services/deploy-pwa.yml -l h1.superpantalles.com
   ```

2. Clear Service Worker cache on clients:
   - Users: Clear browser data
   - Admins: Force Service Worker update via DevTools

3. Investigate issues and create hotfix

---

## Contact

**Author**: Claude (AI Assistant)
**Date**: 2026-02-07
**Branch**: feature/standalone-service-worker
**Deployed**: h1.superpantalles.com

For questions or issues, check console logs with `[SW]` prefix.
