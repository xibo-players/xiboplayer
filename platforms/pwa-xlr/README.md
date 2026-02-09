# PWA-XLR: Xibo PWA Player with XLR Integration

**Status:** ✨ New - Production-ready alternative to core PWA

## Overview

This is a Progressive Web App (PWA) implementation of a Xibo player that integrates the official **Xibo Layout Renderer (XLR)** library. It combines the flexibility of PWA deployment with XLR's production-tested layout rendering, transitions, and media handling.

## Architecture

```
┌─────────────────────────────────────────────┐
│           PWA-XLR Player                    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐      ┌────────────────┐  │
│  │   main.ts    │─────▶│      XLR       │  │
│  │ Orchestrator │      │  (Official)    │  │
│  └──────┬───────┘      └────────────────┘  │
│         │                                   │
│         │                                   │
│  ┌──────▼───────────────────────────────┐  │
│  │        Adapter Layer                 │  │
│  ├──────────────────────────────────────┤  │
│  │ • xlr-adapter.ts                     │  │
│  │   (Cache API → Blob URLs)            │  │
│  │ • schedule-bridge.ts                 │  │
│  │   (Schedule → XLR format)            │  │
│  └──────┬───────────────────────────────┘  │
│         │                                   │
│  ┌──────▼───────────────────────────────┐  │
│  │   Core Infrastructure (@core)        │  │
│  ├──────────────────────────────────────┤  │
│  │ • cache.js - Cache API + IndexedDB   │  │
│  │ • xmds.js - XMDS SOAP client         │  │
│  │ • schedule.js - Schedule parsing     │  │
│  │ • config.js - Configuration          │  │
│  │ • xmr-wrapper.js - XMR messaging     │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Key Features

### ✅ From XLR
- **Professional transitions** (fadeIn, fadeOut, flyIn, flyOut, etc.)
- **Complete widget support** (all Xibo widgets)
- **Video.js media player** (robust video/audio playback)
- **Production-tested rendering** (same as Electron player)
- **Automatic updates** (upstream bug fixes)

### ✅ From Core PWA
- **Schedule management** (priority, dayparting, campaigns)
- **Offline-first caching** (Cache API + IndexedDB)
- **XMDS protocol** (CMS communication)
- **XMR support** (real-time messaging)

### ✅ Unique to PWA-XLR
- **Zero installation** (runs in browser)
- **Cross-platform** (any modern browser)
- **Low maintenance** (XLR handles layout complexity)

## Differences from Core PWA

| Feature | Core PWA | PWA-XLR | Winner |
|---------|----------|---------|--------|
| Campaign cycling | ✅ Manual | ✅ XLR built-in | Equal |
| Transitions | ❌ None | ✅ Full support | **XLR** |
| Media playback | ⚠️ Basic | ✅ Video.js | **XLR** |
| Widget support | ⚠️ Limited | ✅ Complete | **XLR** |
| Code maintenance | ~500 LOC | ~350 LOC | **XLR** |
| Bundle size | ~100KB | ~400KB | Core |
| Startup time | Fast | Medium | Core |

## File Structure

```
platforms/pwa-xlr/
├── package.json              # Dependencies (includes XLR)
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Build configuration
├── index.html                # Entry point
├── src/
│   ├── main.ts               # Player orchestrator (~250 lines)
│   ├── xlr-adapter.ts        # Cache API → XLR adapter (~100 lines)
│   ├── schedule-bridge.ts    # Schedule → XLR converter (~120 lines)
│   └── types.ts              # TypeScript definitions (~100 lines)
├── public/
│   └── sw.js                 # Service worker (from @core)
├── dist/                     # Build output (generated)
└── README.md                 # This file
```

## Development

### Prerequisites

```bash
# From repository root
npm install

# Install platform dependencies
cd platforms/pwa-xlr
npm install
```

### Development Server

```bash
npm run dev
```

Opens at `http://localhost:5174`

### Build for Production

```bash
npm run build
```

Output in `dist/` directory.

### Type Checking

```bash
npm run type-check
```

## Configuration

The player reads configuration from URL parameters or `localStorage`:

```javascript
// URL parameters (for initial setup)
http://localhost:5174/?cmsAddress=http://cms.example.com&cmsKey=yourkey&hardwareKey=abc123

// localStorage (persisted after first setup)
{
  "cmsAddress": "http://cms.example.com",
  "cmsKey": "yourkey",
  "hardwareKey": "abc123",
  "displayName": "PWA Player XLR"
}
```

Configuration is managed by `@core/config.js`.

## Deployment

### Ansible Deployment

Use the provided Ansible playbook:

```bash
cd /path/to/tecman_ansible

# Build player first
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm run build

# Deploy to host
ansible-playbook playbooks/services/deploy-pwa-xlr.yml \
  -e target_host=h1.superpantalles.com
```

The playbook:
1. Creates Podman volume `xibo-player-xlr-storage`
2. Copies `dist/` contents to volume
3. Configures Nginx location `/player-xlr/`

### Manual Deployment

```bash
# Build
npm run build

# Copy to web server
rsync -avz dist/ user@server:/var/www/html/player-xlr/

# Configure web server
# Nginx example:
location /player-xlr/ {
  alias /var/www/html/player-xlr/;
  try_files $uri $uri/ /player-xlr/index.html;
}
```

### Docker/Podman

```bash
# Build image
podman build -t xibo-pwa-xlr .

# Run container
podman run -d -p 8080:80 xibo-pwa-xlr
```

## How It Works

### 1. Initialization

```typescript
// main.ts
async init() {
  // Load core modules (cache, xmds, schedule, config)
  await this.loadCoreModules();

  // Initialize cache
  await cacheManager.init();

  // Create adapters
  this.fileAdapter = new XlrFileAdapter(cacheManager);
  this.scheduleBridge = new ScheduleBridge(scheduleManager, this.fileAdapter);

  // Initialize XLR
  await this.initializeXlr();

  // Start collection cycle
  await this.collect();
}
```

### 2. Collection Cycle (Every 15 minutes)

```typescript
async collect() {
  // 1. Register with CMS
  await xmdsClient.registerDisplay();

  // 2. Get required files list
  const files = await xmdsClient.requiredFiles();

  // 3. Download missing files to Cache API
  for (const file of files) {
    await cacheManager.downloadFile(file);
  }

  // 4. Get schedule
  const schedule = await xmdsClient.schedule();
  scheduleManager.setSchedule(schedule);

  // 5. Convert to XLR format
  const xlrLayouts = await this.scheduleBridge.convertToXlrFormat();

  // 6. Update XLR
  this.xlr.emitter.emit('updateLoop', xlrLayouts);
}
```

### 3. File Access Adapter

```typescript
// xlr-adapter.ts
async provideLayoutFile(layoutId: number): Promise<string | null> {
  // Get from Cache API
  const blob = await this.cacheManager.getCachedFile('layout', layoutId);

  // Create blob URL for XLR
  const blobUrl = URL.createObjectURL(blob);
  return blobUrl;
}
```

### 4. Schedule Bridge

```typescript
// schedule-bridge.ts
async convertToXlrFormat(): Promise<InputLayoutType[]> {
  const layoutObjects = this.scheduleManager.getCurrentLayoutObjects();

  return layoutObjects.map((layout, index) => ({
    layoutId: extractLayoutId(layout.file),
    path: `/cache/layout/${layoutId}.xlf`,
    shortPath: `${layoutId}.xlf`,
    index,
    response: await this.fileAdapter.getLayoutXlf(layoutId), // XLF XML
    duration: layout.duration || 60,
  }));
}
```

### 5. XLR Events

```typescript
// XLR notifies us of layout changes
this.xlr.on('layoutChange', (layoutId) => {
  console.log('Now playing:', layoutId);
});

this.xlr.on('layoutEnd', async (layout) => {
  // Report to CMS
  await xmdsClient.notifyStatus({
    currentLayoutId: layout.layoutId
  });
});
```

## Shared Code with Core PWA

Reuses from `packages/core/`:

- **schedule.js** - Priority resolution, dayparting, campaign merging
- **xmds.js** - XMDS SOAP client for CMS communication
- **cache.js** - Cache API + IndexedDB file storage
- **config.js** - Configuration management
- **xmr-wrapper.js** - XMR real-time messaging

Only ~350 lines of custom code for XLR integration!

## Testing

### Manual Testing

1. Start dev server: `npm run dev`
2. Configure CMS connection via URL parameters
3. Check browser console for logs
4. Verify layouts cycle correctly
5. Test transitions between layouts

### Comparison with Core PWA

Deploy both variants:
- Core PWA: `/player/`
- PWA-XLR: `/player-xlr/`

Test same campaign on both, compare:
- Transition quality
- Media playback
- Widget rendering
- Performance

## Troubleshooting

### XLR not rendering

Check browser console for errors. Common issues:

```javascript
// Missing XLR container
Error: No #xlr-container found

// Fix: Ensure index.html has <div id="xlr-container">
```

### Files not loading

```javascript
// Cache API not working
Error: Failed to fetch from cache

// Fix: Check service worker is registered
// Check browser supports Cache API
```

### Schedule not updating

```javascript
// XMDS errors
Error: XMDS request failed

// Fix: Check cmsAddress, cmsKey, hardwareKey in config
// Check CORS headers if CMS on different domain
```

### Memory leaks

```javascript
// Blob URLs not cleaned up
Warning: Too many blob URLs created

// Fix: Call player.cleanup() on shutdown
// Automatic via beforeunload event
```

## Performance Considerations

### Bundle Size

- Core PWA: ~100KB gzipped
- PWA-XLR: ~400KB gzipped (includes XLR library)

Trade-off: Larger bundle for complete feature set.

### Memory Usage

- XLR maintains layout cache in memory
- Blob URLs need cleanup to prevent leaks
- Automatic cleanup on layout change

### Startup Time

1. Load main.ts (~50ms)
2. Load core modules (~100ms)
3. Initialize cache (~50ms)
4. Initialize XLR (~200ms)
5. First collection cycle (~1-2s)

**Total:** ~2-3 seconds to first layout

## Future Enhancements

### Planned

- [ ] Offline mode indicator
- [ ] Better error recovery
- [ ] Statistics reporting via XMDS
- [ ] Screenshot capability
- [ ] Remote debugging interface

### Possible

- [ ] XLR plugin system integration
- [ ] Custom widget development
- [ ] Advanced caching strategies
- [ ] Service worker optimization

## Migration from Core PWA

### For existing deployments:

1. **Test in parallel:**
   ```bash
   # Deploy PWA-XLR to /player-xlr/
   ansible-playbook playbooks/services/deploy-pwa-xlr.yml
   ```

2. **Compare functionality:**
   - Create test campaign with transitions
   - Verify all features work
   - Test on target hardware

3. **Gradual migration:**
   - Update display URLs one by one
   - Monitor for issues
   - Keep core PWA as fallback

4. **Full migration:**
   - Update all displays to `/player-xlr/`
   - Keep core PWA for 1-2 weeks as backup
   - Remove core PWA deployment

## Support

### Issues

Report issues specific to PWA-XLR integration at:
https://github.com/tecman/xibo_players/issues

For XLR library issues:
https://github.com/xibosignage/xibo-layout-renderer/issues

### Documentation

- XLR documentation: https://github.com/xibosignage/xibo-layout-renderer
- Xibo CMS documentation: https://xibosignage.com/docs
- Core PWA documentation: `../../packages/core/README.md`

## License

Apache 2.0 (same as Xibo)

## Credits

- **XLR Library:** Xibo Signage Ltd
- **PWA Infrastructure:** TecMan
- **Integration:** TecMan

---

**Last Updated:** 2026-01-30
**Version:** 1.0.0
**Status:** Production Ready
