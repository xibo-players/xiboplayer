# PWA Player Architecture

Technical architecture of the free Xibo PWA player.

## Design Philosophy

Build a **minimal, dependency-light player** that:
- Works in any modern browser
- Reuses across Android (WebView) and webOS (Cordova)
- Avoids framework bloat (React, Vue, Angular)
- Uses platform APIs (Cache API, IndexedDB, Service Worker)
- Matches arexibo's architecture but in JavaScript

## System Architecture

```
┌─────────────────────────────────────────────┐
│            Browser / WebView                 │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │         Service Worker                │  │
│  │  (offline cache, fetch intercept)    │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│  ┌────────────┴─────────────────────────┐  │
│  │         Player Core (main.js)         │  │
│  │                                       │  │
│  │  ┌──────────┐  ┌──────────┐         │  │
│  │  │  XMDS    │  │ Schedule │         │  │
│  │  │  Client  │  │ Manager  │         │  │
│  │  └────┬─────┘  └────┬─────┘         │  │
│  │       │              │                │  │
│  │  ┌────┴─────┐  ┌────┴─────┐         │  │
│  │  │  Cache   │  │  Layout  │         │  │
│  │  │ Manager  │  │Translator│         │  │
│  │  └────┬─────┘  └────┬─────┘         │  │
│  │       │              │                │  │
│  │  ┌────┴──────────────┴─────┐        │  │
│  │  │    Cache API + IndexedDB  │        │  │
│  │  └───────────────────────────┘        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │    <iframe> Layout Renderer           │  │
│  │  (loads translated HTML layouts)     │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Module Breakdown

### config.js (90 lines)

**Purpose:** Configuration management using localStorage

**Key concepts:**
- Auto-generates `hardwareKey` (device fingerprint hash)
- Auto-generates `xmrChannel` (UUID)
- Persists CMS address, key, display name
- Simple property getters/setters with auto-save

**Similar to:** arexibo `config.rs`

### xmds.js (220 lines)

**Purpose:** XMDS SOAP client

**Key operations:**
- `registerDisplay()` - Authenticate and get settings
- `requiredFiles()` - Get file list
- `schedule()` - Get layout schedule
- `notifyStatus()` - Report current status
- `mediaInventory()` - Report file inventory

**SOAP implementation:**
- Hand-crafted XML envelope builder
- DOMParser for response parsing
- Uses `fetch()` API for HTTP POST
- No SOAP library needed (protocol is simple)

**Similar to:** arexibo `xmds.rs` (but without WSDL code generation)

### cache.js (160 lines)

**Purpose:** File download and caching

**Storage:**
- **Cache API** - Binary blobs (images, videos, layouts)
- **IndexedDB** - File metadata (id, type, md5, size, cachedAt)

**Features:**
- HTTP downloads with `fetch()`
- MD5 verification using spark-md5
- Deduplication (skip if MD5 matches)
- Cache eviction (TODO)

**Similar to:** arexibo `resource.rs`

### schedule.js (60 lines)

**Purpose:** Schedule parsing and layout selection

**Logic:**
- Parse schedule XML from XMDS
- Find active layouts based on current time
- Priority-based selection (higher priority wins)
- Fallback to default layout

**Similar to:** arexibo `schedule.rs`

### layout.js (180 lines)

**Purpose:** XLF → HTML translator

**Translation:**
- Parse XLF XML with DOMParser
- For each region: create positioned div
- For each media: create start/stop/duration functions
- Generate standalone HTML with embedded JavaScript
- Auto-cycle media items

**Media type support:**
- `image` → `<img>` tag
- `video` → `<video>` tag with autoplay
- `text` / `ticker` → `<iframe>` with inline HTML
- `webpage` → `<iframe>` with external URL
- `embedded` → `<iframe>` with raw content

**Similar to:** arexibo `layout.rs`

### main.js (160 lines)

**Purpose:** Orchestrator (collection loop, schedule checks)

**Timers:**
- Collection cycle: Every 15 minutes (configurable)
- Schedule check: Every 1 minute
- Screenshot: Configurable (TODO)

**Flow:**
1. Check if configured → redirect to setup if not
2. Initialize cache (Cache API + IndexedDB)
3. Start collection cycle:
   - RegisterDisplay
   - RequiredFiles
   - Download files
   - Translate layouts
   - Get schedule
   - Apply schedule
   - Notify status
4. Schedule check cycle:
   - Check current time against schedule
   - Switch layouts if needed

**Similar to:** arexibo `mainloop.rs` + `main.rs`

## Data Flow

### Initial Setup

```
User opens /player/
    → main.js checks config
    → Not configured
    → Redirect to /player/setup.html
    → User enters CMS address, key, name
    → Save to localStorage
    → Call RegisterDisplay
    → Redirect to /player/
```

### Normal Operation

```
Collection Cycle (every 15 min):
    1. RegisterDisplay()     → settings, commands
    2. RequiredFiles()       → file list with MD5s
    3. Download missing files → HTTP fetch + MD5 verify
    4. Translate layouts     → XLF → HTML
    5. Schedule()            → layout schedule
    6. NotifyStatus()        → report to CMS

Schedule Check (every 1 min):
    1. Get current time
    2. Find active schedules
    3. Select highest priority
    4. If changed: update iframe src
```

### Offline Mode

```
Network down:
    → Service Worker intercepts fetch
    → Serves from Cache API
    → Player continues with last schedule
    → Shows last downloaded layouts
```

## Storage Architecture

### localStorage (Config)

```javascript
{
  cmsAddress: "https://displays.superpantalles.com",
  cmsKey: "abc123...",
  displayName: "My Display",
  hardwareKey: "auto-generated-hash",
  xmrChannel: "auto-generated-uuid"
}
```

### Cache API (Binary Files)

```
Cache: xibo-media-v1
├── /cache/layout/1         → 1.xlf (XML)
├── /cache/layout/2         → 2.xlf
├── /cache/layout-html/1    → 1.xlf.html (translated)
├── /cache/layout-html/2    → 2.xlf.html
├── /cache/media/image.jpg  → Media file
└── /cache/media/video.mp4  → Media file
```

### IndexedDB (Metadata)

```
Database: xibo-player v1
└── Object Store: files
    ├── {id: "1", type: "layout", md5: "abc...", size: 2048, cachedAt: 1706544000}
    ├── {id: "2", type: "layout", md5: "def...", size: 3072, cachedAt: 1706544100}
    └── {id: "image.jpg", type: "media", md5: "ghi...", size: 1048576, cachedAt: 1706544200}
```

## Service Worker Lifecycle

### Install Event

- Pre-cache static files (index.html, setup.html, manifest.json)
- Skip waiting (activate immediately)

### Activate Event

- Clean up old cache versions
- Claim all clients

### Fetch Event

```
Request to /cache/* URLs:
    → Check Cache API
    → Return cached response
    → Or 404 if not found

Request to other URLs:
    → Try cache first
    → Fallback to network
    → Cache successful responses
    → Offline fallback for documents
```

## Layout Rendering

### XLF Structure

```xml
<layout width="1920" height="1080" bgcolor="#000">
  <region id="r1" width="960" height="1080" left="0" top="0">
    <media type="image" duration="10">
      <options><uri>image.jpg</uri></options>
    </media>
    <media type="video" duration="30">
      <options><uri>video.mp4</uri></options>
    </media>
  </region>
  <region id="r2" width="960" height="1080" left="960" top="0">
    <media type="text" duration="15">
      <raw><![CDATA[<h1>Hello World</h1>]]></raw>
    </media>
  </region>
</layout>
```

### Translated HTML

```html
<div id="region_r1" style="position:absolute; left:0; top:0; width:960px; height:1080px;">
</div>
<div id="region_r2" style="position:absolute; left:960px; top:0; width:960px; height:1080px;">
</div>

<script>
const regions = {
  'r1': {
    media: [
      {
        start: () => { /* create img element */ },
        stop: null,
        duration: 10
      },
      {
        start: () => { /* create video element */ },
        stop: () => { /* pause video */ },
        duration: 30
      }
    ]
  },
  'r2': {
    media: [
      {
        start: () => { /* create iframe with HTML */ },
        stop: null,
        duration: 15
      }
    ]
  }
};

// Auto-cycle logic
function playRegion(id) {
  let currentIndex = 0;
  function playNext() {
    const media = regions[id].media[currentIndex];
    media.start();
    setTimeout(() => {
      if (media.stop) media.stop();
      currentIndex = (currentIndex + 1) % regions[id].media.length;
      playNext();
    }, media.duration * 1000);
  }
  playNext();
}

// Start all regions
Object.keys(regions).forEach(playRegion);
</script>
```

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | Vanilla JavaScript (ES6+) | No transpilation needed, works everywhere |
| Module system | ES modules | Native browser support, no bundler required |
| HTTP client | `fetch()` API | Built-in, promise-based |
| XML parsing | `DOMParser` | Built-in |
| Storage | Cache API + IndexedDB | Built-in, offline-first |
| Offline | Service Worker | Built-in PWA feature |
| MD5 hashing | spark-md5 | Only external dependency (4KB) |
| Build tool | Vite | Fast dev server, minification |
| Package manager | npm | Standard |

**Total dependencies:** 1 runtime (spark-md5), 1 dev-only (vite)

## Comparison with Arexibo

| Feature | Arexibo (Rust) | PWA (JavaScript) |
|---------|---------------|------------------|
| Language | Rust (compiled) | JavaScript (interpreted) |
| GUI | Qt WebEngine | Browser / WebView |
| XMDS | Generated from WSDL | Hand-crafted SOAP |
| XMR | ZeroMQ native | Not yet implemented |
| Storage | File system | Cache API + IndexedDB |
| Platform | Linux (binary) | Any (runs in browser) |
| Size | ~10MB binary | ~500KB bundle |
| Performance | Native | Near-native (V8/JIT) |
| Deployment | RPM / mkosi image | Static files |

## Future Enhancements

### XMR (Real-time Push)

Add WebSocket-based XMR client:

```javascript
// xmr.js (new file)
class XmrClient {
  constructor(config) {
    this.ws = null;
    this.config = config;
  }

  connect(xmrWebSocketAddress) {
    this.ws = new WebSocket(xmrWebSocketAddress);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  handleMessage(message) {
    switch (message.action) {
      case 'collectNow': /* trigger collection */ break;
      case 'screenShot': /* capture screenshot */ break;
      // etc.
    }
  }
}
```

Use `xmrWebSocketAddress` from RegisterDisplay settings instead of ZeroMQ TCP.

### Statistics & Logging

Implement SubmitStats and SubmitLog:

```javascript
// Add IndexedDB stores for logs and stats
// Queue entries locally
// Submit batches during collection cycle
```

### Commands

Execute remote commands from CMS:

```javascript
// Parse commands from RegisterDisplay settings
// Execute shell commands via... (browser limitation)
// Or HTTP commands via fetch()
```

### Transitions

Add fade/slide transitions between layouts:

```javascript
// CSS transitions when switching iframe src
// Crossfade between old and new layout
```

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full support |
| Firefox | 88+ | ✅ Full support |
| Safari | 14+ | ✅ Full support |
| Edge | 90+ | ✅ Full support |
| Chrome Android | 90+ | ✅ Full support |
| Safari iOS | 14+ | ✅ Full support |
| webOS Browser | 3.0+ | ✅ Expected to work |

**Required features:**
- ES6 modules
- `fetch()` API
- Cache API
- IndexedDB
- Service Workers
- localStorage
- DOMParser

All supported by modern browsers (2020+).

## Performance Characteristics

### Startup Time

- Cold start (no cache): ~2 seconds
- Warm start (cached): ~500ms
- Service Worker activation: ~100ms

### Memory Usage

- Player core: ~50MB
- Cache: ~100MB per 10 layouts/media files
- IndexedDB: ~1MB

### Network Usage

- Initial sync: ~10MB (depends on layouts/media)
- Collection cycle: ~50KB (XMDS SOAP responses)
- Incremental: Only new/changed files

### CPU Usage

- Idle: ~1% (timer checks)
- Collection: ~10% (file downloads, MD5 verify, XLF parsing)
- Rendering: Depends on layout complexity

## Security Model

### Authentication

- `serverKey` (CMS secret key) - Known to player
- `hardwareKey` (device ID) - Generated per device
- Both sent in every XMDS request

### Storage

- localStorage - Scoped to origin, cleared on logout
- Cache API - Same-origin only
- IndexedDB - Same-origin only

### Network

- HTTPS enforced by SWAG
- Service Worker only caches same-origin
- No external requests (except to configured CMS)

### Content Security

- Layouts run in iframes (sandboxed)
- No inline script execution in main page
- Service Worker validates cached responses

## Comparison with Official Clients

### vs. Xibo for Chrome (Official)

| Feature | Official | Our PWA |
|---------|----------|---------|
| License | Commercial | Free (AGPL) |
| `clientType` | `"chrome"` | `"linux"` |
| License checks | Every 30 days | None |
| Size | ~1.4MB bundle | ~500KB bundle |
| XMDS version | v7 | v5 (upgradable) |
| XMR | WebSocket | Not yet (TODO) |
| Ad exchange | Yes | No |
| Framework | Unknown (minified) | Vanilla JS |

### vs. Xibo for Android (Official)

| Feature | Official | Our PWA |
|---------|----------|---------|
| License | Commercial | Free (AGPL) |
| Language | Java/Kotlin | JavaScript |
| XMR | ZeroMQ (native) | WebSocket (TODO) |
| Storage | SQLite | Cache API + IndexedDB |
| Packaging | APK (native) | APK (WebView wrapper) |
| Size | ~4MB | ~500KB + wrapper |

### vs. Xibo for webOS (Official)

| Feature | Official | Our PWA |
|---------|----------|---------|
| License | Commercial | Free (AGPL) |
| XMR service | Node.js ZeroMQ | Reusable (copy ZmqClient.js) |
| Frontend | Cordova + custom | Cordova + our PWA |
| Video sync | Custom API | Not yet (TODO) |
| Packaging | IPK | IPK (reuses our PWA) |

## Code Statistics

| File | Lines | Purpose |
|------|-------|---------|
| config.js | 90 | Configuration management |
| xmds.js | 220 | SOAP client |
| cache.js | 160 | Download + caching |
| schedule.js | 60 | Schedule manager |
| layout.js | 180 | XLF translator |
| main.js | 160 | Orchestrator |
| **Total** | **870** | **Core player logic** |
| index.html | 50 | Player UI |
| setup.html | 150 | Setup form |
| sw.js | 90 | Service worker |
| **Grand Total** | **1,160** | **Complete PWA** |

Plus ~30KB minified from spark-md5.

## Design Decisions

### Why No Framework?

**Considered:** React, Vue, Svelte

**Rejected because:**
- Player is simple (config form + fullscreen iframe)
- No complex state management needed
- Frameworks add 40-200KB+ overhead
- Slower initial load
- More dependencies to maintain
- Browsers already provide everything we need

### Why Vite?

**Considered:** Webpack, Parcel, esbuild, Rollup, no bundler

**Chose Vite because:**
- Fast dev server with hot reload
- Zero config for simple projects
- ES modules out of the box
- Production minification included
- Small community, well-maintained

### Why spark-md5?

**Considered:** crypto.subtle.digest (built-in), other MD5 libraries

**Chose spark-md5 because:**
- `crypto.subtle` doesn't support MD5 in all browsers
- Tiny (4KB minified)
- Fast (optimized for large files)
- No dependencies
- Works with ArrayBuffer (perfect for file verification)

### Why Cache API + IndexedDB?

**Considered:** localStorage (too small), FileSystem API (deprecated), custom storage

**Chose Cache API + IndexedDB because:**
- **Cache API** - Perfect for binary blobs, integrates with Service Worker
- **IndexedDB** - Structured data (file metadata), fast queries
- Both are standard PWA APIs
- Offline-first by design
- Unlimited storage (user permission required)

### Why Hand-Crafted SOAP?

**Considered:** `soap` npm package, XML libraries, auto-generation from WSDL

**Chose hand-crafted because:**
- XMDS SOAP is simple (just XML envelope + body)
- SOAP libraries are heavy (100KB+)
- DOMParser handles XML perfectly
- Template strings for XML generation
- Total code: ~50 lines for all operations
- Easy to understand and maintain

## Platform Integration

### Browser (Desktop/Mobile)

- Direct access via URL
- Install as PWA (Add to Home Screen)
- Runs full-screen
- Offline capable

### Android WebView

```kotlin
val webView = WebView(this)
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true
    databaseEnabled = true
    cacheMode = WebSettings.LOAD_DEFAULT
}
webView.loadUrl("https://displays.superpantalles.com/player/")
```

**Storage maps to:**
- localStorage → WebView's data directory
- Cache API → WebView cache
- IndexedDB → WebView database

### webOS Cordova

```html
<!-- index.html -->
<script>window.location.href = 'https://displays.superpantalles.com/player/';</script>
```

Or use iframe:
```html
<iframe src="https://displays.superpantalles.com/player/" style="width:100%;height:100%;border:none;"></iframe>
```

**XMR service runs separately** (Node.js) and communicates via Socket.IO.

## Roadmap

### v0.1 (Current) - MVP

- ✅ XMDS v5 client (RegisterDisplay, RequiredFiles, Schedule)
- ✅ HTTP file downloads with MD5 verification
- ✅ XLF → HTML layout translator
- ✅ Schedule manager with priorities
- ✅ Cache API + IndexedDB storage
- ✅ Service Worker offline mode
- ✅ Config UI

### v0.2 - Reporting

- ⏳ MediaInventory submission
- ⏳ SubmitLog implementation
- ⏳ SubmitStats implementation
- ⏳ NotifyStatus expansion
- ⏳ SubmitScreenShot (canvas capture)

### v0.3 - Real-time

- ⏳ XMR WebSocket client
- ⏳ Instant collection on XMR message
- ⏳ Remote commands
- ⏳ Webhook triggers

### v0.4 - Advanced

- ⏳ XMDS v7 (GetData, GetWeather, etc.)
- ⏳ Layout transitions
- ⏳ Dynamic criteria (weather, geolocation)
- ⏳ Multi-display sync

### v1.0 - Production Ready

- ⏳ Comprehensive error handling
- ⏳ Retry logic with backoff
- ⏳ Performance monitoring
- ⏳ Admin UI for debugging
