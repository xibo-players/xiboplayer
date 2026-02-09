# Testing the Standalone Service Worker

## Quick Start

1. **Navigate to the player**:
   ```
   https://h1.superpantalles.com:8081/player/pwa/
   ```

2. **Open Browser DevTools**:
   - Press F12
   - Go to Console tab

3. **Clear cache for fresh test**:
   ```javascript
   // Run in console
   await caches.delete('xibo-media-v1');
   await caches.delete('xibo-static-v1');
   localStorage.clear();
   location.reload();
   ```

## What to Look For

### 1. Service Worker Loads

**Expected Console Output**:
```
[SW] Loading standalone Service Worker: 2026-02-06-standalone
[SW] Installing...
[SW] Cache initialized
[SW] Activating...
```

✅ **Success**: Service Worker loaded
❌ **Failure**: No SW messages → Check HTTPS, check browser support

### 2. Files Sent to Service Worker

**Expected Console Output**:
```
[PWA] Sending file list to Service Worker for background download
[PWA] Service Worker acknowledged file download request
[Message] Received: DOWNLOAD_FILES
[Message] Enqueueing X files for download
```

✅ **Success**: Files sent and acknowledged
❌ **Failure**: "Service Worker not active" → SW failed to load

### 3. Downloads Start

**Expected Console Output**:
```
[Queue] Enqueued: https://cms/xmds.php?file=123.mp4 (1 pending, 0 active)
[Queue] Starting download: https://cms/xmds.php?file=123.mp4 (1/4 active)
[Download] Starting: https://cms/xmds.php?file=123.mp4
[Download] File size: 150.0 MB
```

**Network Tab**:
- Should see 4 concurrent requests
- Should see Range requests for large files

✅ **Success**: Downloads start, network activity visible
❌ **Failure**: No network activity → Check CMS URL, check CORS

### 4. Chunks Download (Large Files)

**Expected Console Output**:
```
[Download] Downloading 3 chunks in parallel
[Download] Chunk 1/3 (33.3%)
[Download] Chunk 2/3 (66.7%)
[Download] Chunk 3/3 (100.0%)
[Download] Cached: /cache/media/123 (157286400 bytes)
```

✅ **Success**: Chunks download in parallel, file cached
❌ **Failure**: Single request → File too small (< 100MB), no chunking needed

### 5. Files Cached

**Expected Console Output**:
```
[Queue] Download complete: https://cms/xmds.php?file=123.mp4 (0 active, 1 pending)
```

**Application Tab → Cache Storage**:
- Should see `xibo-media-v1` cache
- Should see entries like `/cache/media/123`

✅ **Success**: Files appear in cache
❌ **Failure**: Cache empty → Check for errors in download

### 6. Layout Renders

**Expected Console Output**:
```
[Request] Serving from cache: /cache/media/123
[PWA] Playing layout 456
```

**Player**:
- Layout should render
- Media should display
- Videos should play

✅ **Success**: Layout plays correctly
❌ **Failure**: Black screen → Check console for errors

### 7. Video Seeking Works

**Network Tab**:
- Scrub video timeline
- Should see 206 Partial Content responses
- Should see Range headers

**Video**:
- Should seek instantly
- No re-download of entire file

✅ **Success**: Video seeks correctly
❌ **Failure**: Video restarts → Range requests not working

### 8. Reload (Cache Test)

**After first boot completes**:
```javascript
location.reload();
```

**Expected Console Output**:
```
[Message] File already cached: /cache/media/123
[Request] Serving from cache: /cache/media/123
```

**Network Tab**:
- Should NOT see media file downloads
- Only RequiredFiles and Schedule requests

✅ **Success**: Files served from cache, no re-download
❌ **Failure**: Re-downloading files → Cache not working

## Common Issues

### Issue: "Service Worker not active"

**Cause**: Service Worker failed to load or not supported

**Solutions**:
1. Check HTTPS is enabled (Service Workers require HTTPS)
2. Check browser supports Service Workers (Chrome 40+, Firefox 44+)
3. Check Service Worker tab in DevTools → Should show registered SW
4. Hard refresh (Ctrl+Shift+R)

### Issue: Downloads stuck in queue

**Cause**: Network errors, CORS issues, CMS not responding

**Solutions**:
1. Check console for error messages
2. Check Network tab for failed requests (red)
3. Check CMS logs for errors
4. Verify CMS URL is correct

### Issue: Video not seeking

**Cause**: Range requests not working, cache missing Accept-Ranges header

**Solutions**:
1. Check Network tab → Click video request → Response Headers
2. Should see: `Accept-Ranges: bytes`
3. Should see: `Content-Range: bytes X-Y/Z`
4. If missing, Service Worker not handling Range requests correctly

### Issue: Layout not rendering

**Cause**: Files not cached, download failed, rendering error

**Solutions**:
1. Check Application tab → Cache Storage → xibo-media-v1
2. Verify files are cached
3. Check console for rendering errors
4. Check if all required files downloaded

## Performance Check

### Download Speed

**Before (Sequential)**:
- 10 files × 2 min each = 20 min total

**After (Parallel)**:
- 10 files with 4 concurrent = ~5 min total

**Measure**:
1. Note time when downloads start
2. Note time when all downloads complete
3. Should be 3-4x faster than sequential

### Memory Usage

**Check Browser Memory**:
- Task Manager → Browser process
- Should stay stable (not grow continuously)
- Should not exceed 1GB for large files

**If memory grows**:
- Blob URL leaks → Check renderer-lite.js
- Cache not releasing → Check Service Worker

## Advanced Testing

### Test Multiple Layouts

1. Configure schedule with multiple layouts
2. Let player cycle through all layouts
3. Check memory stays stable
4. Check no re-downloads on replay

### Test Large Files

1. Add 1GB+ video to layout
2. Check chunked downloads work
3. Check video plays after complete download
4. Check seeking works

### Test Offline Mode

1. Wait for all files to cache
2. Open DevTools → Network tab
3. Enable "Offline" mode
4. Reload player
5. Should still work (served from cache)

### Test Cache Clear

**Console**:
```javascript
// Send clear cache message to Service Worker
const mc = new MessageChannel();
mc.port1.onmessage = (e) => console.log('Cache cleared:', e.data);
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' }, [mc.port2]);
```

**Expected**:
- Console: `[Cache] Cleared X cached files`
- Application tab: Cache empty
- Reload triggers re-download

## Success Criteria

✅ **All tests pass**:
1. Service Worker loads
2. Files sent to Service Worker
3. Downloads start (4 concurrent)
4. Chunks download in parallel (large files)
5. Files cached correctly
6. Layout renders
7. Video seeking works
8. Reload serves from cache (no re-download)

✅ **Performance improved**:
- Downloads 3-4x faster
- Memory stays stable
- Video seeking instant

✅ **No regressions**:
- Layout switching works
- Widget rendering works
- XLR compatibility maintained

## Report Issues

If tests fail, provide:
1. Browser console output (full log)
2. Network tab screenshot
3. Application → Cache Storage screenshot
4. Steps to reproduce

Post in: `/home/pau/Devel/tecman/xibo_players/issues/`

---

**Version**: 2026-02-06-standalone
**Documentation**: docs/SERVICE_WORKER_ARCHITECTURE.md
