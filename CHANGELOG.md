# Changelog

## 0.6.4 (2026-03-06)

### Features

- **Cross-device multi-display sync** via WebSocket relay (`@xiboplayer/sync`)
- **Shell command execution** from CMS — remote commands via XMR
- **Per-CMS cache and config storage** — multiple CMS instances don't collide
- **Video controls** — press `v` to toggle native video controls (reaches into widget iframes)

### Fixes

- **FD leak** — close ReadStream file descriptors in serveFromStore and serveChunkedFile
- **V8 OOM** — reduce chunk download concurrency to prevent heap exhaustion on large files
- **Video duration** — use exact duration instead of Math.floor truncation
- **Timeline overlay** — wall-clock countdown with chained times, accurate image-only layouts
- **Layout render failure** — set status code 3 so CMS marks display as error
- **Geolocation** — cache result and skip browser API after first failure
- **Config gate** — fix per-CMS storage key isolation

### Refactoring

- **Canonical API path** — `PLAYER_API` default changed from `/api/v2/player` to `/player/api/v2`, matching CMS `.htaccess` routing. All hardcoded paths replaced with the `PLAYER_API` variable; single source of truth in `@xiboplayer/utils`
- **CmsClient interface** — formalized with conformance checks for REST/SOAP transports
- **Config consolidation** — add Config getters, fix relaxSslCerts leak
- **Rename** PlayerApiV2 → PlayerRestApi across all references
