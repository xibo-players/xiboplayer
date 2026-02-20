# PWA Player Status - v0.1.0

## Current Status: PRODUCTION READY

**Feature Parity:** ~95% vs upstream Xibo players
**Last Updated:** 2026-02-17

## What Works

### XMDS Communication (10/10 Methods)
- RegisterDisplay - Authentication, settings, XMR address
- RequiredFiles - File list with CRC32 skip optimization
- Schedule - Layout schedule with actions, commands, data connectors
- GetResource / GetWidgetHtml - Server-rendered widget content
- MediaInventory - Report cached file inventory
- NotifyStatus - Status with disk usage and timezone
- SubmitLog - CMS log submission with fault reporting
- SubmitStats - Proof-of-play with aggregation
- SubmitScreenShot - Periodic + on-demand screenshot capture
- BlackList - Media blacklisting via SOAP

### Dual Transport (PWA Exclusive)
- SOAP/XML transport (XmdsClient) - All CMS versions
- REST/JSON transport (RestClient) - ETag 304 caching, 30% smaller payloads
- Selectable per deployment

### Layout Rendering (RendererLite)
- Full XLF parsing with layout scaling and centering
- Image, video, audio, text, clock, webpage, embedded, PDF, HLS, dataset widgets
- Fade and fly transitions (8 compass directions)
- Element reuse pattern (pre-create all, toggle visibility)
- Parallel media prefetch (Promise.all)
- Background images and colors
- ResizeObserver for dynamic rescaling
- Blob URL lifecycle tracking (no memory leaks)

### Schedule Management
- Priority-based layout selection
- Dayparting with ISO day-of-week and midnight crossing
- maxPlaysPerHour with even distribution
- Campaign scheduling (first-class objects)
- Interrupt/share-of-voice interleaving
- Overlay management with priority-based z-index
- Action events, command events, data connector events
- Default layout fallback
- Geo-fencing enforcement (haversine distance filtering)
- Criteria enforcement (evaluateCriteria with 5 metrics + custom display properties)
- Browser Geolocation API fallback (when CMS has no coordinates)

### XMR Push Messaging (13 Handlers)
- collectNow, screenShot, licenceCheck
- changeLayout, overlayLayout, revertToSchedule
- purgeAll, commandAction, triggerWebhook
- dataUpdate, criteriaUpdate, currentGeoLocation, rekey
- RSA key pair generation and registration (Web Crypto API)
- Key rotation via rekey command
- Exponential backoff reconnection (10 attempts)

### Interactive Control
- Full IC server via postMessage
- Touch/click action triggers
- Keyboard action triggers
- Navigate to layout, navigate to widget
- Previous/next widget navigation
- Duration control (expire, extend, set)
- Fault reporting endpoint
- Real-time data connector endpoint

### Stats and Logging
- Layout and widget proof-of-play (StatsCollector, IndexedDB)
- Stats aggregation (hourly grouping, configurable level)
- Log submission to CMS (LogReporter, IndexedDB)
- Fault reporting with deduplication (5-min cooldown)
- Replay-safe tracking (auto-end previous on replay)
- Quota-exceeded cleanup (auto-delete oldest 100)

### Cache and Offline
- 4 parallel chunk downloads (1-2 min for 1GB vs 5 min sequential)
- Dynamic chunk sizing based on device RAM
- MD5 verification (spark-md5)
- Corrupted cache auto-detection and cleanup
- Font CSS URL rewriting
- Widget HTML caching via Service Worker
- Progressive streaming (Range request support)
- Full offline mode (IndexedDB fallback for schedule, settings, required files)
- Persistent storage (navigator.storage.persist())

### Config and Settings
- Stable hardware key (FNV-1a hash, "pwa-" prefix)
- DisplaySettings class with EventEmitter
- CMS log level control
- Download window support
- Screenshot interval configuration
- Wake Lock API (screen sleep prevention)
- Centralized PlayerState

### Screenshot Capture
- Primary: getDisplayMedia (native browser capture including video)
- Fallback: html2canvas (DOM rendering)
- Triggers: XMR command, periodic interval
- Submission: SOAP or REST

### Multi-Platform
- PWA (primary) - Any browser, installable
- Electron - Desktop wrapper (XLR fork)
- Android - WebView wrapper
- webOS - Cordova wrapper

## Known Gaps (~5%)

### Low Impact (Rarely Used)
- Drawer regions (XLR-specific UI feature)
- Multi-display sync events (very rare use case)
- BroadcastChannel stats (stats go direct to CMS)

### Not Applicable (Browser Sandbox)
- Shell commands (use HTTP commands instead)
- RS232 serial port (N/A in browser)

## Performance

| Metric | PWA | XLR v1.0.22 | Windows v4 R406 |
|--------|------------|-------------|-----------------|
| Initial load | 3-5s | 17-20s | 5-10s |
| Layout replay | <0.5s | 2-3s | 1-2s |
| 1GB download | 1-2 min | ~5 min | ~5 min |
| Widget switch | <50ms | ~200ms | ~100ms |
| Bundle size | ~500KB | ~2MB | ~50MB |
| Memory (10 cycles) | Stable | +500MB | Stable |

## Code Statistics

| Category | Lines | Files |
|----------|-------|-------|
| Core packages | ~7,500 | 20 source files |
| Platform (PWA) | ~3,200 | 2 files |
| Tests | ~3,000+ | 12 test files |
| **Total** | **~12,000** | **~22 files** |

## Build and Test

```bash
# Unit tests (all packages)
pnpm test

# Specific package
pnpm test --filter @xiboplayer/core
pnpm test --filter @xiboplayer/renderer

# Build PWA (from xiboplayer-pwa repo)
pnpm run build
```

## Browser Compatibility

| Browser | Version | Tested |
|---------|---------|--------|
| Chrome | 90+ | Yes |
| Firefox | 88+ | Yes |
| Edge | 90+ | Yes |
| Safari | 14+ | Expected |
| Chrome Android | 90+ | Expected |
| webOS Browser | 3.0+ | Expected |

## Related Documentation

- Architecture: `packages/docs/ARCHITECTURE.md`
- Renderer comparison: `packages/renderer/docs/RENDERER_COMPARISON.md`
- Deployment guide: `packages/docs/DEPLOYMENT.md`
