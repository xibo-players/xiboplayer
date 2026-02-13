# PWA Player Completion Plan

Complete the standalone PWA player using renderer-lite.js for full video widget support.

## Context

**Repository:** xibo_players
**Branch:** `feature/pwa-lite`
**Current State:** Structure created, renderer-lite library complete, video blocked in PWA-XLR by XLR limitations

## Goal

Build production-ready standalone PWA player at `platforms/pwa/` that:
- Uses renderer-lite.js (24KB) instead of XLR (868KB)
- Supports ALL widget types including video/audio
- Works with same infrastructure as PWA-XLR
- Deploys to `/player/pwa/` path

## Current Status

### ✅ Completed

1. **RendererLite Library** (`packages/core/src/renderer-lite.js`)
   - 848 lines, 24KB
   - XLF parsing and rendering
   - Widget support: image, video, audio, text, PDF, webpage
   - CSS transitions (fade, fly)
   - Event-driven API
   - No external dependencies except nanoevents

2. **PWA Platform Structure** (`platforms/pwa/`)
   - src/main.ts - Player entry point
   - index.html - Player page
   - setup.html - Configuration page
   - package.json, tsconfig.json, vite.config.ts
   - public/sw.js - Service Worker

3. **Core Infrastructure**
   - XMR wrapper with reconnection logic
   - Cache manager with MD5 validation
   - XMDS client
   - Schedule manager
   - Config manager

### ⏳ Remaining Tasks

1. **Complete main.ts Integration**
   - Currently: Calls renderer.renderLayout() but doesn't handle video blob URLs
   - Need: Implement video widget rendering with blob URLs
   - Pattern: After caching, create blob URLs and pass to renderer

2. **Enhance RendererLite Video Support**
   - Current: Basic structure in renderer-lite.js
   - Need: Ensure video rendering uses blob URLs from cache
   - Test: Video playback with HTML5 video element

3. **Test Widget Rendering**
   - Text widgets
   - Image widgets
   - Video widgets (critical!)
   - Audio widgets
   - PDF widgets

4. **Build System**
   - Verify Vite build works
   - Check bundle sizes
   - Ensure sw.js is copied

5. **Deployment**
   - Create `playbooks/services/deploy-pwa.yml`
   - Deploy to `/player/pwa/` (separate from /player/xlr/)
   - Test on h1.superpantalles.com

6. **End-to-End Testing**
   - Registration and collection
   - Layout loading
   - Widget rendering (all types)
   - Video playback
   - Schedule cycling
   - XMR integration

## Technical Approach

### Video Widget Flow

```
1. Collection Phase:
   - Download 23.mp4 from CMS
   - Cache with key: /cache/media/23
   - Store with Content-Type: video/mp4

2. Rendering Phase:
   - RendererLite parses XLF
   - Finds <media fileId="23" type="video">
   - Calls cacheManager.getCachedFile('media', 23)
   - Creates blob URL: blob://abc-123
   - Creates <video src="blob://abc-123">
   - Video plays directly from cache!
```

### Key Differences from PWA-XLR

| Feature | PWA-XLR | PWA (standalone) |
|---------|---------|------------------|
| Renderer | XLR (npm package) | RendererLite (local) |
| Bundle Size | ~1.2 MB | ~150 KB |
| Video URLs | XLR constructs (broken) | Direct blob URLs |
| Dependencies | XLR library | None (only nanoevents) |
| Control | Limited | Full |

## Implementation Steps

### Step 1: Fix Video Rendering in RendererLite

```javascript
// In renderer-lite.js renderWidget method
case 'video':
  const fileId = widget.fileId;
  const blob = await cacheManager.getCachedFile('media', fileId);
  if (blob) {
    const blobUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = blobUrl;
    video.autoplay = widget.mute === '1';
    video.muted = widget.mute === '1';
    video.loop = widget.loop === '1';
    regionElement.appendChild(video);
  }
  break;
```

### Step 2: Update main.ts

```typescript
// After downloading files in collect()
const layout = scheduleManager.getCurrentLayouts()[0];
const layoutId = parseInt(layout.replace('.xlf', ''));
const xlfBlob = await cacheManager.getCachedFile('layout', layoutId);
const xlfXml = await xlfBlob.text();

// Render with RendererLite (blob URLs handled internally)
await this.renderer.renderLayout(xlfXml, layoutId);
```

### Step 3: Build and Deploy

```bash
cd platforms/pwa
npm install
npm run build

# Deploy (in tecman_ansible repo)
cd ../../../tecman_ansible
ansible-playbook playbooks/services/deploy-pwa.yml -e target_host=h1.superpantalles.com
```

### Step 4: Test

1. Navigate to: https://displays.superpantalles.com/player/pwa/
2. Configure with CMS
3. Check console for:
   - `[PWA] Initializing player with RendererLite...`
   - `[RendererLite] Rendering video widget...`
   - Video element created with blob://... src
   - Video plays!

## Success Criteria

- ✅ Player loads and connects to CMS
- ✅ XMR WebSocket connects
- ✅ Layouts downloaded and parsed
- ✅ Text widgets render
- ✅ Image widgets render
- ✅ **Video widgets render and play**
- ✅ Audio widgets render and play
- ✅ PDF widgets render
- ✅ Schedule cycling works
- ✅ Bundle size < 200KB

## Estimated Time

- Video rendering implementation: 30 min
- Testing and fixes: 60 min
- Deployment setup: 15 min
- End-to-end testing: 15 min

**Total: ~2 hours**

## Next Session Prompt

```
Complete the standalone PWA player with video support:

Context:
- Branch: feature/pwa-lite
- Library: packages/core/src/renderer-lite.js (complete, 848 lines)
- Player: platforms/pwa/src/main.ts (structure ready)
- Infrastructure: XMR, cache, xmds all working

Task:
Implement video widget rendering in RendererLite that uses blob URLs directly.

Steps:
1. Update renderer-lite.js video widget case to use blob URLs from cache
2. Ensure main.ts passes cache manager to renderer
3. Test video playback
4. Create deployment playbook
5. Deploy to /player/pwa/
6. Test end-to-end

Expected result: Videos play via blob URLs without XLR URL construction issues.
```

## Conclusion

PWA-XLR is production-ready for non-video content. For full video support, complete the standalone PWA player which has no XLR limitations and full control over media URLs.
