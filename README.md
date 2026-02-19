# Xibo Player SDK

Modular JavaScript SDK for building [Xibo](https://xibosignage.com) digital signage players. Each package handles one concern — combine them to build a full player, or use individual packages in your own projects.

All packages are published to npm under the [`@xiboplayer`](https://www.npmjs.com/org/xiboplayer) scope.

[![npm](https://img.shields.io/npm/v/@xiboplayer/core?label=%40xiboplayer%2Fcore&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/core)
[![npm](https://img.shields.io/npm/v/@xiboplayer/renderer?label=%40xiboplayer%2Frenderer&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/renderer)
[![npm](https://img.shields.io/npm/v/@xiboplayer/schedule?label=%40xiboplayer%2Fschedule&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/schedule)
[![npm](https://img.shields.io/npm/v/@xiboplayer/xmds?label=%40xiboplayer%2Fxmds&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/xmds)
[![npm](https://img.shields.io/npm/v/@xiboplayer/xmr?label=%40xiboplayer%2Fxmr&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/xmr)
[![npm](https://img.shields.io/npm/v/@xiboplayer/cache?label=%40xiboplayer%2Fcache&color=0097D8)](https://www.npmjs.com/package/@xiboplayer/cache)

## Features

- **Full Xibo protocol support** — XMDS SOAP v3–v7, REST API, and XMR WebSocket
- **Rich media rendering** — video (MP4/HLS), images, PDF, text/ticker, web pages, clock, calendar, weather, and all CMS widget types
- **Offline-first** — Cache API + IndexedDB storage with automatic fallback to cached schedule when network is unavailable
- **Parallel chunk downloads** — large files (100MB+) split into 50MB chunks, header+trailer first for instant MP4 playback start
- **Layout preloading** — 2-layout pool pre-builds upcoming layouts at 75% of current duration for instant zero-gap transitions
- **Campaign scheduling** — priority-based campaigns, weekly dayparting with midnight-crossing, geo-fencing, and criteria evaluation
- **Interrupts / share of voice** — percentage-based interrupt scheduling with even interleaving across the hour
- **Overlay support** — multiple simultaneous overlay layouts with independent scheduling and priority
- **Transitions** — fade and fly (8-direction compass) transitions via Web Animations API
- **Interactive actions** — touch/click and keyboard triggers for widget navigation, layout jumps, and command execution
- **Real-time CMS commands** — collectNow, screenshot, changeLayout, overlayLayout, revertToSchedule, purgeAll, dataUpdate via XMR WebSocket
- **Proof of play** — per-layout and per-widget duration tracking with individual or aggregated submission
- **Multi-display sync** — BroadcastChannel-based lead/follower synchronization for video walls
- **Timeline prediction** — deterministic future schedule simulation for proactive content preloading
- **Network resilience** — exponential backoff with jitter, CRC32-based skip optimization, ETag HTTP caching
- **CORS proxy** — shared Express server for Electron and Chromium shells with XMDS, REST, and file download proxying plus PWA static serving
- **970+ tests** across 28 test suites

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`@xiboplayer/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@xiboplayer/core?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/core) | Player orchestration, collection cycle, offline mode, layout state machine |
| [`@xiboplayer/renderer`](packages/renderer) | [![npm](https://img.shields.io/npm/v/@xiboplayer/renderer?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/renderer) | XLF layout rendering — video, image, PDF, text, web, transitions, actions, preloading |
| [`@xiboplayer/schedule`](packages/schedule) | [![npm](https://img.shields.io/npm/v/@xiboplayer/schedule?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/schedule) | Campaigns, dayparting, interrupts, overlays, geo-fencing, criteria, timeline |
| [`@xiboplayer/xmds`](packages/xmds) | [![npm](https://img.shields.io/npm/v/@xiboplayer/xmds?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/xmds) | XMDS SOAP + REST client — RegisterDisplay, RequiredFiles, Schedule, GetResource, stats |
| [`@xiboplayer/xmr`](packages/xmr) | [![npm](https://img.shields.io/npm/v/@xiboplayer/xmr?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/xmr) | XMR WebSocket — real-time commands with auto-reconnect |
| [`@xiboplayer/cache`](packages/cache) | [![npm](https://img.shields.io/npm/v/@xiboplayer/cache?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/cache) | Offline cache — parallel chunk downloads, MD5 verification, download queue |
| [`@xiboplayer/stats`](packages/stats) | [![npm](https://img.shields.io/npm/v/@xiboplayer/stats?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/stats) | Proof of play, log reporting, fault alerts with deduplication |
| [`@xiboplayer/settings`](packages/settings) | [![npm](https://img.shields.io/npm/v/@xiboplayer/settings?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/settings) | CMS display settings — resolution, intervals, download windows, screenshot config |
| [`@xiboplayer/utils`](packages/utils) | [![npm](https://img.shields.io/npm/v/@xiboplayer/utils?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/utils) | EventEmitter, logger, fetchWithRetry, CMS REST API client, config |
| [`@xiboplayer/sw`](packages/sw) | [![npm](https://img.shields.io/npm/v/@xiboplayer/sw?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/sw) | Service Worker — media caching, range requests, widget HTML serving |
| [`@xiboplayer/sync`](packages/sync) | [![npm](https://img.shields.io/npm/v/@xiboplayer/sync?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/sync) | Multi-display synchronization — lead/follower, synchronized video start |
| [`@xiboplayer/proxy`](packages/proxy) | [![npm](https://img.shields.io/npm/v/@xiboplayer/proxy?style=flat-square)](https://www.npmjs.com/package/@xiboplayer/proxy) | CORS proxy + PWA server — shared by Electron and Chromium shells |

## Quick start

Install all packages at once:

```bash
npm install @xiboplayer/core @xiboplayer/renderer @xiboplayer/schedule \
  @xiboplayer/xmds @xiboplayer/xmr @xiboplayer/cache @xiboplayer/stats \
  @xiboplayer/settings @xiboplayer/utils @xiboplayer/proxy
```

Or install only what you need:

```bash
npm install @xiboplayer/xmds    # just the CMS SOAP client
npm install @xiboplayer/cache   # just the offline cache
npm install @xiboplayer/proxy   # CORS proxy + PWA server for shells
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    @xiboplayer/core                      │
│         collection cycle · offline mode · events         │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ renderer │ schedule │  cache   │  stats   │  settings   │
│  layout  │ campaign │ offline  │ proof of │  display    │
│ widgets  │ daypart  │  chunks  │   play   │  config     │
│ actions  │interrupt │   MD5    │  logs    │  windows    │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│       @xiboplayer/xmds            @xiboplayer/xmr       │
│   SOAP + REST ↔ CMS           WebSocket ↔ CMS push     │
├─────────────────────────────────────────────────────────┤
│  @xiboplayer/proxy     @xiboplayer/utils    @xibo/sync  │
│  CORS proxy · PWA      logger · events     video wall   │
│  static server         fetch · config      lead/follow  │
└─────────────────────────────────────────────────────────┘
```

## CMS communication

The SDK supports two transport protocols:

| Protocol | Package | Use case |
|----------|---------|----------|
| **XMDS SOAP** | `@xiboplayer/xmds` | Standard Xibo player protocol (v3–v7) |
| **REST API** | `@xiboplayer/xmds` | Lighter JSON transport (~30% smaller payloads), ETag caching |
| **XMR WebSocket** | `@xiboplayer/xmr` | Real-time push commands from CMS |

**XMDS methods:** RegisterDisplay, RequiredFiles, Schedule, GetResource, NotifyStatus, MediaInventory, BlackList, SubmitStats, SubmitScreenShot, SubmitLog

**XMR commands:** collectNow, screenshot, changeLayout, overlayLayout, revertToSchedule, purgeAll, dataUpdate, triggerWebhook, commandAction, criteriaUpdate, currentGeoLocation

## Rendering

The renderer parses Xibo Layout Format (XLF) files and builds a live DOM with:

| Widget type | Implementation |
|-------------|---------------|
| Video | `<video>` with native HLS (Safari) + hls.js fallback, pause-on-last-frame |
| Image | `<img>` with objectFit contain, blob URL from cache |
| PDF | PDF.js canvas rendering (dynamically imported) |
| Text / Ticker | iframe with CMS-rendered HTML via GetResource |
| Web page | bare `<iframe src="...">` |
| Clock, Calendar, Weather | iframe via GetResource (server-rendered) |
| All other CMS widgets | Generic iframe via GetResource |

Layout features: proportional scaling with ResizeObserver, overlay support (z-index 1000+), 2-layout preload pool for zero-gap transitions, element reuse on same-layout replay, media-ready gating (layout timer starts only when all first widgets are loaded).

## Players built with this SDK

| Player | Platform | Install |
|--------|----------|---------|
| [xiboplayer-pwa](https://github.com/xibo-players/xiboplayer-pwa) | Any browser | Hosted on your CMS |
| [xiboplayer-electron](https://github.com/xibo-players/xiboplayer-electron) | Fedora / Ubuntu | `dnf install xiboplayer-electron` |
| [xiboplayer-chromium](https://github.com/xibo-players/xiboplayer-chromium) | Fedora / Ubuntu | `dnf install xiboplayer-chromium` |
| [xibo-kiosk](https://github.com/xibo-players/xibo-kiosk) | Fedora / Ubuntu | `dnf install xibo-kiosk` |

RPM and DEB packages are available from [dnf.xiboplayer.org](https://dnf.xiboplayer.org).

## Development

### Prerequisites

- Node.js 20+
- pnpm 10+

### Setup

```bash
pnpm install
```

### Testing

```bash
pnpm test              # run all tests (970+ tests across 28 suites)
pnpm test:watch        # watch mode
pnpm test:coverage     # with coverage report
```

### Workspace structure

This is a pnpm workspace monorepo. Packages use `workspace:*` internally; pnpm converts these to semver ranges on publish.

## License

AGPL-3.0-or-later
