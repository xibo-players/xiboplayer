# PWA Image Loading Debug Status
**Last Updated:** 2026-02-09 02:00 UTC
**Status:** Images not loading - NS_ERROR_INTERCEPTION_FAILED

## Current State

### ✅ What's Working
1. **Service Worker activation** - SW installs, activates, and claims pages
2. **Event synchronization** - SW sends SW_READY signal, page receives it
3. **File downloads** - All 13 required files download successfully
4. **File caching** - media/1 cached successfully (41.5 KB verified)
5. **Widget rendering** - Clock and text widgets display correctly
6. **XMDS fetch interception** - SW successfully intercepts xmds.php URLs

### ❌ What's NOT Working
1. **Cache URL interception** - SW does NOT intercept `/player/pwa/cache/media/1` requests
2. **Image display** - Image widget renders but shows no image (blob URL is null)
3. **NS_ERROR_INTERCEPTION_FAILED** - Firefox throws this when fetch() is called

## Root Cause Analysis

### Evidence from Logs

**Page Console** (console-export-fresh_boot.log):
```
Line 74: [CacheProxy:SW] Received SW_READY signal - fetch handler is ready ✓
Line 124: [PWA] Media 1 cached and valid (41.5 KB) ✓
Line 161-163: Calling fetch(/player/pwa/cache/media/1)... ✓
Line 165-167: NS_ERROR_INTERCEPTION_FAILED ❌
Line 169: getFile returned: null ❌
```

**Service Worker Console** (sw.log):
```
Lines 20-23: [SW] Fetching widget resource from CMS: bundle.min.js ✓
             (xmds.php URLs ARE being intercepted!)

Lines ???: NO [SW] handleRequest logs for /player/pwa/cache/media/1 ❌
           (cache URLs are NOT being intercepted!)
```

### The Mystery

**Why does SW intercept xmds.php but NOT /player/pwa/cache/?**

Both should match the `shouldIntercept` condition:
```javascript
url.pathname.startsWith('/player/pwa/cache/') ||  // Should match media/1!
url.pathname.startsWith('/player/') && ... ||
url.pathname.includes('xmds.php') && ...          // Matches widget resources ✓
```

**Hypothesis:** The SW handleRequest is being called but returning `null`, which causes NS_ERROR_INTERCEPTION_FAILED.

## Code Changes Made (Not Yet Tested)

### 1. Service Worker Tracing (sw.js)
Added logging at the start of `handleRequest()`:
```javascript
async handleRequest(event) {
  const url = new URL(event.request.url);
  console.log('[SW] handleRequest called for:', url.href);
  console.log('[SW] pathname:', url.pathname);

  // ... existing code ...

  if (!url.pathname.startsWith('/player/pwa/cache/')) {
    console.log('[SW] NOT a cache request, returning null:', url.pathname);
    return null;
  }
  console.log('[SW] IS a cache request, proceeding...', url.pathname);
}
```

### 2. CacheProxy Race Condition Fix (cache-proxy.js)
Fixed FAST PATH logic to detect installing SW:
```javascript
// OLD: Always used active SW if it existed (even if being replaced)
if (registration && registration.active) {
  // Use active SW immediately
}

// NEW: Skip FAST PATH if new SW is installing
if (registration && registration.active && !registration.installing && !registration.waiting) {
  // Only use active SW if no updates pending
}

if (registration && (registration.installing || registration.waiting)) {
  console.log('[CacheProxy] New Service Worker detected, waiting for it to activate...');
  // Wait for new SW instead of using old one
}
```

### 3. Enhanced CacheProxy Tracing (cache-proxy.js)
Added step-by-step logging in getFile():
```javascript
console.log('[CacheProxy:SW] DEBUG: About to call fetch()...');
console.log('[CacheProxy:SW] DEBUG: Calling fetch(...)...');
console.log('[CacheProxy:SW] DEBUG: fetch returned, status:', response.status);
console.log('[CacheProxy:SW] DEBUG: Response OK, getting blob...');
console.log('[CacheProxy:SW] DEBUG: Got blob, size:', blob.size);
// In catch:
console.error('[CacheProxy:SW] getFile EXCEPTION:', error);
console.error('[CacheProxy:SW] Error name:', error.name);
```

## Deployment Status

### Files Built
- `platforms/pwa/dist/assets/main-kMhPP8yK.js` (02:59) - Latest with all fixes
- `platforms/pwa/dist/sw.js` (02:59) - With handleRequest tracing

### Files Deployed to h1.superpantalles.com
- `main-kMhPP8yK.js` ✓ (deployed at 01:59)
- `sw.js` ✓ (needs verification)

### Deployment Issue
**Browser cache:** Test logs show `main-Cc2_gpjd.js` being loaded (old bundle), not `main-kMhPP8yK.js` (new bundle). Browser HTTP cache is serving stale JavaScript!

## Next Steps (PRIORITY ORDER)

### STEP 1: Force Browser to Load New Bundle
**Problem:** Browser cached old main-Cc2_gpjd.js, not loading new main-kMhPP8yK.js

**Solutions:**
1. Hard reload with cache clear: Ctrl+Shift+F5 (or Ctrl+F5)
2. Incognito/private browsing mode (no cache)
3. Different browser entirely
4. Manually clear browser cache: DevTools → Network → Disable cache checkbox

**Expected:** After force-reload, should see `main-kMhPP8yK.js` in network requests

### STEP 2: Capture COMPLETE SW Console Logs
**Critical:** Need SW logs showing handleRequest execution

**How to capture:**
1. Open `about:debugging#/runtime/this-firefox`
2. Find Service Worker for /player/pwa/
3. Click "Inspect" - opens SW DevTools
4. Clear console
5. Reload main page (not SW inspector)
6. Watch SW console for:
   ```
   [SW] handleRequest called for: https://displays.superpantalles.com/player/pwa/cache/media/1
   [SW] pathname: /player/pwa/cache/media/1
   [SW] IS a cache request, proceeding... /player/pwa/cache/media/1
   [SW] DEBUG: Request URL: /player/pwa/cache/media/1
   [SW] DEBUG: Cache lookup result: FOUND
   [SW] Serving from cache: /player/pwa/cache/media/1 (42524 bytes)
   ```

**If you see "NOT a cache request":** pathname check is broken - debug URL parsing
**If you see nothing:** fetch handler not being called at all - scope issue
**If you see "IS a cache request" but then crash:** bug in cache lookup or response creation

### STEP 3: Test with Clean State
```javascript
// In page console:

// 1. Unregister ALL SWs
await navigator.serviceWorker.getRegistrations().then(r =>
  Promise.all(r.map(reg => reg.unregister()))
);

// 2. Clear ALL caches (including browser cache)
await caches.keys().then(keys =>
  Promise.all(keys.map(k => caches.delete(k)))
);

// 3. Clear localStorage
localStorage.clear();

// 4. Hard reload (important!)
location.reload(true);
```

### STEP 4: Verify SW Code Is Deployed
```bash
# On local machine:
ssh h1.superpantalles.com 'sudo grep -c "handleRequest called for" \
  $(podman volume inspect xibo-player-storage --format "{{.Mountpoint}}")/pwa/sw.js'

# Should return: 1 or 2 (meaning the new logging is there)
```

### STEP 5: Alternative Testing Method
If Firefox continues to have issues, test in Chrome/Chromium:
```bash
# Using Playwright MCP server
# Navigate to: https://displays.superpantalles.com/player/pwa/
# Chrome handles Service Workers differently than Firefox
```

## Known Issues

### NS_ERROR_INTERCEPTION_FAILED
**Firefox-specific error** when Service Worker fetch handler returns invalid value.

**Causes:**
1. `event.respondWith(null)` - passing null to respondWith
2. `event.respondWith(undefined)` - no return value
3. Exception thrown in handleRequest before respondWith
4. Promise rejection in handleRequest

**Our case:** handleRequest likely returns `null` at line 207:
```javascript
if (!url.pathname.startsWith('/player/pwa/cache/')) {
  return null; // ← This causes NS_ERROR_INTERCEPTION_FAILED if called!
}
```

**But why?** The pathname IS `/player/pwa/cache/media/1`, so it should NOT hit this condition!

## Debug Theories

### Theory 1: URL Parsing Issue
Maybe `url.pathname` is not what we expect?
- Expected: `/player/pwa/cache/media/1`
- Actual: `???` (need SW logs to confirm)

### Theory 2: SW Not Receiving Fetch Events
Maybe the fetch event listener isn't registered properly?
- But widget resources (xmds.php) ARE intercepted ✓
- So listener IS registered, just not matching cache URLs

### Theory 3: Scope Limitation
Maybe SW scope doesn't cover cache URLs?
- SW scope: `https://displays.superpantalles.com/player/pwa/` ✓
- Cache URL: `https://displays.superpantalles.com/player/pwa/cache/media/1` ✓
- Should be covered!

### Theory 4: Browser-Specific Behavior
Maybe Chrome/Firefox handle SW fetch events differently for programmatic fetch() vs user navigation?
- Widget resources use fetch() and work ✓
- Cache URLs use fetch() and fail ❌
- Both are XHR/fetch requests, should behave the same

## Files to Check

### Key Source Files
1. `packages/core/src/cache-proxy.js` - CacheProxy and ServiceWorkerBackend
2. `platforms/pwa/public/sw.js` - Service Worker with fetch handler
3. `platforms/pwa/src/main.ts` - Main PWA application

### Key Deployed Files
1. `/player/pwa/assets/main-kMhPP8yK.js` - Application bundle
2. `/player/pwa/sw.js` - Service Worker (check if updated!)

### Verification Commands
```bash
# Check SW has new logging
ssh h1 'sudo grep "handleRequest called for" \
  $(podman volume inspect xibo-player-storage --format "{{.Mountpoint}}")/pwa/sw.js'

# Check main bundle has new logging
ssh h1 'sudo grep -c "New Service Worker detected" \
  $(podman volume inspect xibo-player-storage --format "{{.Mountpoint}}")/pwa/assets/main-*.js'
```

## Recommended Debugging Approach

1. **Verify new code is deployed** (check main-kMhPP8yK.js and sw.js)
2. **Force browser to load new code** (hard reload, incognito, or new browser)
3. **Capture SW console logs** (about:debugging → Inspect → watch for handleRequest logs)
4. **Compare page vs SW logs** (understand why fetch fails from page but SW never sees it)
5. **Test hypothesis** (is pathname wrong? is handleRequest not called? is it returning null?)

## Success Criteria

When fixed, logs should show:
```
PAGE CONSOLE:
[CacheProxy:SW] Received SW_READY signal ✓
[CacheProxy:SW] DEBUG: Calling fetch(/player/pwa/cache/media/1)... ✓
[CacheProxy:SW] DEBUG: fetch returned, status: 200 OK ✓
[CacheProxy:SW] DEBUG: Got blob, size: 42524 ✓
[PWA] Media 1 blob URL created: blob:https://... ✓

SW CONSOLE:
[SW] handleRequest called for: .../player/pwa/cache/media/1 ✓
[SW] pathname: /player/pwa/cache/media/1 ✓
[SW] IS a cache request, proceeding... ✓
[SW] DEBUG: Cache lookup result: FOUND ✓
[SW] Serving from cache: ... (42524 bytes) ✓
```

## Background Tasks

- **Task #10:** Fix SW initialization race (IN PROGRESS) - code written, needs testing
- **Task #11:** Debug SW fetch interception (IN PROGRESS) - SW logging added, needs SW console capture
- **Task #12:** Automated browser testing (COMPLETED) - test-pwa-image.cjs created

## Sleep Well!

The issue is well-understood and isolated. The problem is purely a fetch interception issue - everything else works. With the new SW logging deployed, the next test session should reveal exactly what handleRequest is receiving and why it's not serving the file.

**Quick test when you wake up:**
1. Hard reload (Ctrl+Shift+F5)
2. Open SW console (about:debugging)
3. Look for "[SW] handleRequest called for" logs
4. Send me both page console export AND SW console export
5. We'll see immediately why it's failing!
