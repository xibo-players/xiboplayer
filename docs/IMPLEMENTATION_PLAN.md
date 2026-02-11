# PWA Player Implementation Plan: Feature Gap Closure

## Architecture Overview

The PWA player is organized as a monorepo with these key packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@xiboplayer/core` | `packages/core/src/player-core.js` | Platform-independent orchestration |
| `@xiboplayer/xmds` | `packages/xmds/src/xmds.js` | SOAP API client |
| `@xiboplayer/xmr` | `packages/xmr/src/xmr-wrapper.js` | WebSocket push messaging |
| `@xiboplayer/renderer` | `packages/renderer/src/renderer-lite.js` | XLF layout renderer |
| `@xiboplayer/cache` | `packages/cache/src/cache.js` | Cache API + IndexedDB file management |
| `@xiboplayer/schedule` | `packages/schedule/src/schedule.js` | Layout scheduling |
| `@xiboplayer/stats` | `packages/stats/src/` | Stats collector + Log reporter |
| `@xiboplayer/settings` | `packages/settings/src/settings.js` | Display settings management |
| `@xiboplayer/utils` | `packages/utils/src/` | Config, logger, events |
| Platform PWA | `platforms/pwa/src/main.ts` | PWA-specific integration |

---

## Implementation Status (Updated 2026-02-12)

All 15 planned features have been implemented and committed.

### P0 -- Critical for Production

| # | Feature | Status | Implementation |
|---|---------|--------|----------------|
| 1 | Log Submission to CMS | **DONE** | Logger sinks in `logger.js`, `LogReporter` wired in `main.ts`, `submitLogs()` called each collection cycle |
| 2 | Fault Reporting | **DONE** | `LogReporter.reportFault()` with deduplication cooldown. Called from collection-error, command-result, renderer errors, IC faults |

### P1 -- High Impact

| # | Feature | Status | Implementation |
|---|---------|--------|----------------|
| 3 | CRC32 Optimization | **DONE** | `checkRf`/`checkSchedule` extracted from RegisterDisplay, compared in `collect()` to skip redundant XMDS calls |
| 4 | Interactive Control | **DONE** | Cache rewrites `hostAddress` to `/player/pwa/ic`, SW intercepts IC routes, `main.ts` dispatches via `setupInteractiveControl()` |
| 5 | Layout Scaling | **DONE** | `scaleFactor`/`offsetX`/`offsetY` in renderer, `ResizeObserver` for dynamic rescaling, `rescaleRegions()` on resize |

### P2 -- Medium Impact

| # | Feature | Status | Implementation |
|---|---------|--------|----------------|
| 6 | Stats Aggregation | **DONE** | `getAggregatedStatsForSubmission()` in stats-collector.js, `aggregationLevel` from DisplaySettings used in `main.ts` |
| 7 | Font CSS URL Rewriting | **DONE** | `cacheWidgetHtml()` parses CSS `url()` references, rewrites to local paths, fetches and caches font files |
| 8 | Purge List | **DONE** | `player-core.js` separates `type="purge"` entries, emits `purge-request`, `main.ts` handles via `cacheProxy.deleteFiles()` |
| 9 | Screenshots (XMR) | **DONE** | `captureScreenshot()` using html2canvas, periodic screenshots via `screenshotInterval` setting, XMR `screenshot-request` handler |
| 10 | Action Events | **DONE** | XMDS parses `<action>`, `<command>`, `<dataconnector>` from schedule XML. PlayerCore processes actions |

### P3 -- Low Impact

| # | Feature | Status | Implementation |
|---|---------|--------|----------------|
| 11 | Data Connectors | **DONE** | `DataConnectorManager` in `packages/core/src/data-connectors.js` |
| 12 | Dependants Tracking | **DONE** | `addDependant()`, `removeLayoutDependants()`, `isMediaReferenced()` in `cache.js` |
| 13 | Background Image | **DONE** | Renderer parses `background` attribute from XLF `<layout>` element and applies as container background |
| 14 | State Class | **DONE** | `packages/core/src/state.js` for centralized player state |
| 15 | Retry Logic | **DONE** | `fetchWithRetry()` in `packages/utils/src/fetch-retry.js`, used by XMDS client |

---

## Remaining Minor TODOs

| File | Line | Issue | Priority |
|------|------|-------|----------|
| `renderer-lite.js` | 416 | Get actual video duration from video element when widget duration=0 | Low (defaults to 60s) |
| `xmds.js` | 328 | Parse criteria elements if present | Low (geo/criteria not used yet) |
| `xmr-wrapper.js` | 238 | RSA key pair rotation for XMR encryption | Low (plain WebSocket works) |
| `overlays.js` | 61 | Geo-location enforcement for overlays | Low |
| `overlays.js` | 69 | Criteria evaluation for overlays | Low |

---

## Key Files Modified

- `platforms/pwa/src/main.ts` - Central integration: all features wired through PwaPlayer
- `packages/core/src/player-core.js` - Orchestration: CRC32, schedule cycles, interactivity, offline cache
- `packages/renderer/src/renderer-lite.js` - Rendering: scaling, background images, widget control
- `packages/cache/src/cache.js` - Caching: font rewriting, static resources, dependant tracking
- `packages/xmds/src/xmds.js` - Protocol: namespace-aware parsing, retry, actions/commands
- `packages/utils/src/logger.js` - Log sinks for CMS submission
- `packages/utils/src/fetch-retry.js` - Resilient network requests
- `packages/stats/src/log-reporter.js` - Log storage, fault reporting, CMS submission formatting
- `packages/stats/src/stats-collector.js` - Proof of play stats with aggregation
- `platforms/pwa/public/sw.js` - Progressive streaming, static resource serving, IC interception
