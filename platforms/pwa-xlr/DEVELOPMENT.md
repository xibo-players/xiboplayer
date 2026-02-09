# PWA-XLR Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Build
npm run build

# Development server
npm run dev
```

## Project Structure

```
src/
├── main.ts              # Main player orchestrator
├── xlr-adapter.ts       # Cache API → XLR file adapter
├── schedule-bridge.ts   # Schedule → XLR format converter
├── types.ts             # TypeScript type definitions
└── core-types.d.ts      # Type declarations for core JS modules
```

## Key Integration Points

### 1. Core Module Loading

The player dynamically loads JavaScript modules from `packages/core`:

```typescript
const cacheModule = await import('@core/cache.js');
const xmdsModule = await import('@core/xmds.js');
const scheduleModule = await import('@core/schedule.js');
const configModule = await import('@core/config.js');
```

TypeScript types for these modules are in `core-types.d.ts`.

### 2. XLR Initialization

XLR requires specific options:

```typescript
const xlrOptions: OptionsType = {
  // File URL endpoints
  xlfUrl: `${baseUrl}/cache/layout/`,
  getResourceUrl: `${baseUrl}/cache/media/`,
  // ... other URLs

  // Platform
  platform: ConsumerPlatform.LINUX,

  // CMS config
  config: {
    cmsUrl: config.cmsAddress,
    schemaVersion: 4,
    cmsKey: config.cmsKey,
    hardwareKey: config.hardwareKey,
  },
};
```

### 3. File Adapter

XLR expects files via HTTP URLs. We store in Cache API.

The `XlrFileAdapter` creates blob URLs:

```typescript
const blob = await cacheManager.getCachedFile('layout', layoutId);
const blobUrl = URL.createObjectURL(blob);
return blobUrl;
```

### 4. Schedule Bridge

Converts schedule.js output to XLR format:

```typescript
const layoutObjects = scheduleManager.getCurrentLayoutObjects();

const xlrLayouts = layoutObjects.map((layout, index) => ({
  layoutId: extractLayoutId(layout.file),
  path: `/cache/layout/${layoutId}.xlf`,
  shortPath: `${layoutId}.xlf`,
  index,
  response: xlfContent, // XLF XML
  duration: layout.duration || 60,
}));
```

### 5. Collection Cycle

Every 15 minutes:

1. Register display (XMDS)
2. Get required files list (XMDS)
3. Download missing files (Cache API)
4. Get schedule (XMDS)
5. Convert to XLR format
6. Update XLR loop

## Development Workflow

### Local Development

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Configure player:**
   Navigate to:
   ```
   http://localhost:5174/?cmsAddress=http://cms.local&cmsKey=KEY&hardwareKey=HW
   ```

3. **Monitor console:**
   All logs prefixed with `[PWA-XLR]`, `[XLR-Adapter]`, or `[ScheduleBridge]`

### Testing Changes

1. **Make changes to src/**
2. **Type check:**
   ```bash
   npm run type-check
   ```
3. **Build:**
   ```bash
   npm run build
   ```
4. **Test build:**
   ```bash
   npm run preview
   ```

### Debugging

#### Enable verbose logging:

```javascript
// In browser console
localStorage.setItem('debug', 'xlr:*');
```

#### Check XLR state:

```javascript
// In browser console
console.log(window.xlr); // XLR instance (if exposed)
```

#### Check cache:

```javascript
// In browser console
caches.keys().then(console.log);
caches.open('xibo-player-cache').then(cache => {
  cache.keys().then(console.log);
});
```

## Common Issues

### XLR not rendering

**Symptom:** Blank screen, no layouts

**Checks:**
1. XLR container exists: `document.getElementById('xlr-container')`
2. Layouts loaded: Check network tab for layout file requests
3. XLR initialized: Console should show `[PWA-XLR] XLR initialized`

### Files not loading from cache

**Symptom:** 404 errors for media files

**Cause:** XLR expects real URLs, we provide blob URLs

**Fix:** Check `XlrFileAdapter.provideMediaFile()` is called

### Type errors during development

**Issue:** TypeScript errors for core modules

**Fix:** Update `core-types.d.ts` with correct interface

### Build warnings

**Issue:** "Some chunks are larger than 500 kB"

**Cause:** XLR library is large (~289 KB gzipped)

**Impact:** Acceptable for production use

## Deployment

### Build for production:

```bash
npm run build
```

### Deploy with Ansible:

```bash
cd /path/to/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa-xlr.yml \
  -e target_host=h1.superpantalles.com
```

### Manual deploy:

```bash
# Copy dist/ to server
rsync -avz dist/ user@server:/var/www/html/player-xlr/

# Configure Nginx
# Add location /player-xlr/ { ... }
```

## Testing Checklist

Before deploying:

- [ ] Type check passes: `npm run type-check`
- [ ] Build succeeds: `npm run build`
- [ ] Player connects to CMS
- [ ] Layouts download correctly
- [ ] Layouts cycle automatically
- [ ] Transitions work (if layouts have transitions)
- [ ] Media plays (images, videos)
- [ ] No console errors
- [ ] No memory leaks (check after 1+ hour)

## Performance Tuning

### Reduce bundle size:

Currently ~900 KB total (~290 KB gzipped).

Options:
1. Tree-shaking (Vite does this)
2. Dynamic imports for large modules
3. Use XLR minified build

### Improve startup time:

1. **Preload critical resources:**
   ```html
   <link rel="preload" href="/assets/xlr-*.js" as="script">
   ```

2. **Service worker caching:**
   Already implemented in `sw.js`

3. **Lazy load XLR:**
   ```typescript
   const XLR = await import('@xibosignage/xibo-layout-renderer');
   ```

## Architecture Notes

### Why separate platform?

1. **Low risk:** Doesn't affect existing core PWA
2. **Clean integration:** No backward compatibility needed
3. **TypeScript benefits:** Type safety from the start
4. **Easy comparison:** Deploy both, compare features

### Code reuse:

- ✅ schedule.js (schedule parsing)
- ✅ xmds.js (CMS communication)
- ✅ cache.js (file storage)
- ✅ config.js (configuration)
- ✅ xmr-wrapper.js (XMR messaging)

Only ~350 lines custom code!

### Future improvements:

1. **Better error handling:**
   - Retry failed file downloads
   - Fallback layouts on error
   - Error reporting to CMS

2. **Statistics:**
   - Track layout playback
   - Report to CMS via XMDS
   - Bandwidth usage stats

3. **Offline mode:**
   - Indicator when offline
   - Queue XMDS calls
   - Sync when back online

## Contributing

### Code style:

- Use TypeScript for new code
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions focused and small

### Testing:

1. Add type definitions for new features
2. Test on real hardware (if possible)
3. Test with different CMS versions
4. Test offline scenarios

### Pull requests:

1. Run type check: `npm run type-check`
2. Run build: `npm run build`
3. Test locally
4. Document changes in commit message

---

**Last Updated:** 2026-01-30
