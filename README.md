# Xibo Player SDK

Modular JavaScript SDK for building Xibo digital signage players. All packages are published to npm under the `@xiboplayer` scope.

## Packages

| Package | Description |
|---------|-------------|
| [`@xiboplayer/core`](packages/core) | Player orchestration and lifecycle management |
| [`@xiboplayer/renderer`](packages/renderer) | RendererLite — fast XLF layout rendering engine |
| [`@xiboplayer/schedule`](packages/schedule) | Campaigns, dayparting, interrupts, and overlays |
| [`@xiboplayer/xmds`](packages/xmds) | XMDS SOAP client for CMS communication |
| [`@xiboplayer/xmr`](packages/xmr) | XMR WebSocket client for real-time CMS commands |
| [`@xiboplayer/cache`](packages/cache) | Offline caching with parallel chunk downloads |
| [`@xiboplayer/stats`](packages/stats) | Proof of play tracking and CMS logging |
| [`@xiboplayer/settings`](packages/settings) | CMS settings management |
| [`@xiboplayer/utils`](packages/utils) | Shared utilities (logger, crypto, helpers) |
| [`@xiboplayer/sw`](packages/sw) | Service Worker toolkit for chunk streaming |
| [`@xiboplayer/sync`](packages/sync) | Multi-display synchronization |

## CMS Communication

The SDK supports two protocols for communicating with a Xibo CMS:

- **REST API** (primary) — used when the CMS exposes the REST endpoint
- **XMDS SOAP** (fallback) — the standard Xibo player protocol

## Installation

```bash
npm install @xiboplayer/core @xiboplayer/renderer @xiboplayer/schedule \
  @xiboplayer/xmds @xiboplayer/xmr @xiboplayer/cache @xiboplayer/stats \
  @xiboplayer/settings @xiboplayer/utils
```

Or install individual packages as needed.

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
pnpm test              # run all tests (949 tests across 27 suites)
pnpm test:watch        # watch mode
pnpm test:coverage     # with coverage report
```

### Workspace structure

This is a pnpm workspace monorepo. Packages use `workspace:*` internally; pnpm converts these to semver ranges on publish.

## Players using this SDK

| Player | Description |
|--------|-------------|
| [xiboplayer-pwa](https://github.com/xibo-players/xiboplayer-pwa) | Progressive Web App player |
| [xiboplayer-electron](https://github.com/xibo-players/xiboplayer-electron) | Electron kiosk wrapper — RPM for Fedora |
| [xiboplayer-chromium](https://github.com/xibo-players/xiboplayer-chromium) | Chromium kiosk — RPM for Fedora |

## License

AGPL-3.0-or-later
