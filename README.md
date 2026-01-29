# Xibo Players

Free, open-source Xibo-compatible digital signage players for multiple platforms.

## Repository Structure

This is a monorepo containing:

- **`core/`** — Shared JavaScript player core (PWA)
  - XMDS client, cache manager, layout renderer, schedule manager
  - Runs in browsers, WebViews, and webOS

- **`android/`** — Android wrapper (Kotlin + WebView)
  - Loads core/ inside a native app
  - Boot receiver, kiosk mode, screen lock

- **`webos/`** — webOS wrapper (IPK packaging + Node.js XMR service)
  - Loads core/ inside webOS browser engine
  - Cordova bridge, platform APIs

## Project Goal

Build free players that work with any Xibo CMS without commercial licenses.

**Key strategy**: Use `clientType: "linux"` in XMDS RegisterDisplay to bypass commercial license checks. The CMS automatically assigns `commercialLicence = 3` (not applicable) for Linux clients.

## Getting Started

### Core PWA Player

```bash
cd core
npm install
npm run dev    # Development server
npm run build  # Production bundle
```

Open http://localhost:5173 and configure your CMS connection.

### Android

See `android/README.md`

### webOS

See `webos/README.md`

## Documentation

Full technical documentation: https://github.com/linuxnow/xibo_players_docs

- XMDS protocol reference
- XMR protocol reference
- Layout format (XLF)
- Analysis of official clients

## License

AGPL-3.0 — same as Xibo CMS and arexibo
