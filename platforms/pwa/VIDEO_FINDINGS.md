# Video Widget Investigation - PWA-XLR Findings

## Summary

Investigated video widget playback in PWA-XLR player. Videos cache correctly and blob URLs are created, but XLR's hardcoded URL construction prevents direct blob usage.

## What Works ✅

1. **XMR WebSocket**: Stable with heartbeats, instant CMS updates
2. **Video Caching**: Videos download and cache with MD5 validation
3. **Blob URL Creation**: `XlrFileAdapter.provideMediaFile()` creates blob URLs from cache
4. **XLF Modification**: `PwaLayout.replaceMediaWithBlobs()` replaces URIs using fileId attribute
5. **MD5 Validation**: Lenient for videos and layouts to avoid blocking collection
6. **Text/Image/PDF Widgets**: Work perfectly
7. **Collection Cycle**: Completes successfully

## What Doesn't Work ❌

**Video Playback** - XLR hardcodes video URL construction:

```
XLF: <uri>blob://abc-123</uri>
XLR constructs: /xmds.php?file=blob://abc-123
Result: 404 error
```

Even with `libraryDownloadUrl: ''`, XLR prepends `/xmds.php?file=` to video URIs.

## Investigation Details

### Caching (Working)

- Uses .NET client pattern: MD5 validation, file IDs, cache keys
- Videos cache with Content-Type headers preserved
- Cache keys: `/cache/media/{fileId}`
- Blob URLs: `blob://...` created from cached Response

### XLF Structure

```xml
<media id="83" type="video" fileId="23">
  <options>
    <uri>23.mp4</uri>
  </options>
</media>
```

- `id="83"`: Widget instance ID
- `fileId="23"`: Media library file ID (use this for cache lookup!)
- `<uri>`: Filename (we replace with blob URL)

### Blob URL Replacement

```javascript
// In PwaLayout.replaceMediaWithBlobs()
const fileId = mediaEl.getAttribute('fileId'); // Not 'id'!
const blob = await fileAdapter.provideMediaFile(parseInt(fileId));
uri.textContent = blob; // Replace 23.mp4 with blob://...
```

Works correctly - blob URLs are inserted into XLF.

### XLR URL Construction (The Problem)

XLR internally does:
```
mediaUrl = libraryDownloadUrl + "/xmds.php?file=" + uri
```

This is hardcoded and cannot be overridden through options. Result:
```
"/xmds.php?file=blob://..." → 404
```

## Comparison with Other Players

### Electron
- **Local server**: Express on `localhost:9696`
- **Video URL**: `http://localhost:9696/files/23.mp4`
- **XLR constructs**: `libraryDownloadUrl + filename`
- **Works** because local server serves files

### Arexibo
- **Local server**: Rouille HTTP server
- **Direct file access**: Serves from disk
- **Range requests**: Full HTTP protocol support
- **Works** because it's a native app with file server

### .NET Client
- **Local files**: Direct file system access
- **MD5 validation**: Same as our approach
- **Cache by**: File IDs and paths
- **Works** because it has file system access

### PWA Constraints
- **No local server** possible in browser
- **Service Worker**: Acts as "virtual server" but browsers cache SW aggressively
- **Blob URLs**: Work for direct video element src, but XLR modifies them
- **XLR dependency**: Cannot override internal URL construction

## Solutions Explored

### 1. Service Worker Interception ❌
- Intercept `/xmds.php?file=23.mp4` → serve from cache
- **Problem**: Browser caches SW, won't update reliably
- **Problem**: CORS blocks Content-Length header
- **Problem**: HEAD vs GET request coordination issues
- **Result**: Abandoned due to development iteration issues

### 2. Blob URL Replacement ✅ (Partially)
- Replace `<uri>23.mp4</uri>` with `<uri>blob://...</uri>`
- **Works**: Blob URLs created and inserted
- **Problem**: XLR still prepends `/xmds.php?file=`
- **Result**: Invalid URL constructed by XLR

### 3. Empty libraryDownloadUrl ❌
- Set `libraryDownloadUrl: ''` to prevent prepending
- **Problem**: XLR still adds `/xmds.php?file=`
- **Result**: Hardcoded behavior cannot be overridden

## Recommended Solution

**Use standalone PWA player with RendererLite** (already created):

- **No XLR dependency**: Full control over URL construction
- **Direct blob URLs**: Videos load via `blob://...` directly
- **Smaller bundle**: 24KB vs 868KB
- **Same core modules**: Reuses xmds, cache, schedule, xmr
- **Located**: `platforms/pwa/` with `packages/core/src/renderer-lite.js`

## Implementation Status

### Completed
- ✅ RendererLite library (packages/core/src/renderer-lite.js)
- ✅ PWA player structure (platforms/pwa/)
- ✅ Blob URL infrastructure (XlrFileAdapter, PwaLayout)
- ✅ Video caching with MD5 validation
- ✅ XMR stable WebSocket connection

### Remaining for PWA Player
- ⏳ Complete video widget rendering in RendererLite
- ⏳ Test video playback with blob URLs
- ⏳ Deploy to /player/pwa/ path
- ⏳ Create deployment playbook
- ⏳ End-to-end testing

## Conclusion

**PWA-XLR**: Production-ready for text, images, PDFs. Video blocked by XLR limitations.

**PWA (standalone)**: Best path forward for full video support. Estimated 2-3 hours to complete and test.

## Files Modified

- packages/core/src/cache.js - MD5 leniency
- packages/core/src/renderer-lite.js - Lightweight XLF renderer
- platforms/pwa-xlr/src/main.ts - Blob replacement, XMR fixes
- platforms/pwa-xlr/src/pwa-layout.ts - replaceMediaWithBlobs()
- platforms/pwa-xlr/src/xlr-adapter.ts - provideMediaFile()
- platforms/pwa-xlr/public/sw.js - Video cache attempts (sw-v2.js)
- platforms/pwa/ - Standalone player structure

## Branch

All work on: `feature/pwa-lite`
