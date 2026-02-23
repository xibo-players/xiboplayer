# @xiboplayer/proxy

**CORS proxy and static server for Xibo Player shells.**

## Overview

Shared Express server used by all XiboPlayer shells (Electron, Chromium kiosk, standalone):

- **XMDS Proxy** — forwards SOAP/XML requests to the CMS (`/xmds-proxy`)
- **REST Proxy** — forwards REST API requests (`/rest-proxy`)
- **File Proxy** — downloads media files with Range support (`/file-proxy`)
- **PWA Server** — serves the PWA player as static files (`/player/pwa/`)

## Installation

```bash
npm install @xiboplayer/proxy
```

## Usage

### As a library

```javascript
import { createProxyApp, startServer } from '@xiboplayer/proxy';

// Option 1: get the Express app (for embedding in Electron, etc.)
const app = createProxyApp({
  pwaPath: '/path/to/pwa/dist',
  appVersion: '1.0.0',
});
app.listen(8765, 'localhost');

// Option 2: start a standalone server
const { server, port } = await startServer({
  port: 8765,
  pwaPath: '/path/to/pwa/dist',
  appVersion: '1.0.0',
});
```

### As a CLI

```bash
npx xiboplayer-proxy --pwa-path=../xiboplayer-pwa/dist --port=8765
```

## API Reference

### `createProxyApp({ pwaPath, appVersion })`

Returns a configured Express app with all proxy routes and static PWA serving.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pwaPath` | `string` | (required) | Absolute path to PWA dist directory |
| `appVersion` | `string` | `'0.0.0'` | Version for User-Agent header |

### `startServer({ port, pwaPath, appVersion })`

Creates the app and starts listening. Returns `Promise<{ server, port }>`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port` | `number` | `8765` | Port to listen on |
| `pwaPath` | `string` | (required) | Absolute path to PWA dist directory |
| `appVersion` | `string` | `'0.0.0'` | Version for User-Agent header |

## Proxy Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/xmds-proxy?cms=URL` | ALL | Proxies XMDS SOAP requests to `URL/xmds.php` |
| `/rest-proxy?cms=URL&path=/api/...` | ALL | Proxies REST API requests |
| `/file-proxy?cms=URL&url=/path` | GET | Downloads files (supports Range) |
| `/player/pwa/` | GET | Serves PWA static files |
| `/` | GET | Redirects to `/player/pwa/` |

## Dependencies

- `express` — HTTP server
- `cors` — CORS middleware

---

[xiboplayer.org](https://xiboplayer.org) · **Part of the [XiboPlayer SDK](https://github.com/xibo-players/xiboplayer)**
