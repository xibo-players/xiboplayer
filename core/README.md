# Xibo Player Core (PWA)

Free, open-source Xibo-compatible digital signage player built as a Progressive Web App.

## Features

- ✅ Full XMDS v5 protocol support
- ✅ HTTP file downloads with MD5 verification
- ✅ XLF layout translation to HTML
- ✅ Schedule management with priorities
- ✅ Offline caching (Cache API + IndexedDB)
- ✅ Service Worker for offline operation
- ⏳ XMR real-time push (TODO)
- ⏳ XMDS chunked downloads (TODO)
- ⏳ Statistics and log submission (TODO)

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### CORS Issues

If you get "NetworkError when attempting to fetch resource", the CMS is blocking cross-origin requests. Choose one solution:

**Option 1: Enable CORS on CMS (recommended)**

Add to your CMS web server config:

Apache (`/web/.htaccess`):
```apache
Header set Access-Control-Allow-Origin "*"
Header set Access-Control-Allow-Methods "POST, GET, OPTIONS"
Header set Access-Control-Allow-Headers "Content-Type"
```

Nginx:
```nginx
add_header Access-Control-Allow-Origin *;
```

**Option 2: Use the CORS proxy (for testing)**

```bash
# Terminal 1
CMS_URL=http://your-cms-address npm run proxy

# Terminal 2
npm run dev
```

Then in the player setup, use `http://localhost:8080` as the CMS address.

### Configuration

1. Enter your CMS address (e.g., `https://cms.example.com`)
2. Enter your CMS key (found in CMS Settings → Display Settings)
3. Enter a display name
4. Click "Connect"
5. Authorize the display in your CMS (Displays → Authorize)
6. Refresh the setup page

The player will start downloading content and displaying layouts.

## How It Works

### Collection Cycle (every 15 minutes)

1. **RegisterDisplay** — Authenticate with CMS, get settings
2. **RequiredFiles** — Get list of layouts and media to download
3. **Download files** — HTTP downloads with MD5 verification
4. **Translate layouts** — Convert XLF to HTML
5. **Schedule** — Get layout schedule
6. **Apply schedule** — Show correct layout based on time/priority
7. **NotifyStatus** — Report current status to CMS

### Schedule Check (every 1 minute)

Checks if the current time matches a different scheduled layout and switches if needed.

### Offline Operation

- All layouts and media are cached locally (Cache API)
- Service Worker intercepts requests and serves from cache
- Player continues working even if CMS is unreachable

## Architecture

```
src/
├── config.js      — localStorage configuration
├── xmds.js        — SOAP client (RegisterDisplay, RequiredFiles, Schedule, etc.)
├── cache.js       — Cache API + IndexedDB manager
├── schedule.js    — Schedule parser and priority logic
├── layout.js      — XLF→HTML translator
└── main.js        — Orchestrator (collection loop, schedule checks)
```

## Configuration Storage

All configuration is stored in `localStorage`:

```javascript
{
  cmsAddress: 'https://cms.example.com',
  cmsKey: 'your-cms-key',
  displayName: 'My Display',
  hardwareKey: 'auto-generated-uuid',
  xmrChannel: 'auto-generated-uuid'
}
```

## File Cache

Files are cached using two systems:

1. **Cache API** (`xibo-media-v1`) — Binary blobs (images, videos, layouts)
2. **IndexedDB** (`xibo-player`) — File metadata (id, type, md5, size, cachedAt)

Access cached files via `/cache/{type}/{id}` URLs.

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 11.3+)
- Chrome on Android: Full support (can be wrapped in WebView)
- webOS browser: Full support (can be packaged as IPK)

## Development

### Build for production

```bash
npm run build
```

Output: `dist/` directory with minified bundle.

### Preview production build

```bash
npm run preview
```

## TODO

- [ ] XMR real-time push (WebSocket)
- [ ] XMDS GetFile chunked downloads
- [ ] SubmitLog, SubmitStats
- [ ] SubmitScreenShot
- [ ] MediaInventory reporting
- [ ] Dynamic criteria (weather, geolocation)
- [ ] Layout transitions
- [ ] Multi-display sync

## License

AGPL-3.0-or-later
