# Xibo Player Configuration

Both the Electron and Chromium players are configured through a `config.json` file.
The file is sparse — only include keys you want to override; defaults apply for the rest.

## Config File Location

| Player   | Path                                          |
|----------|-----------------------------------------------|
| Electron | `~/.config/xiboplayer/electron/config.json`   |
| Chromium | `~/.config/xiboplayer/chromium/config.json`   |

On first run (RPM/DEB install), the system default from `/usr/share/xiboplayer-*/config.json` is copied to the user path if it doesn't exist. The PWA setup page handles CMS registration.

## Configuration Reference

### CMS Connection

| Key           | Type   | Default | Description                          |
|---------------|--------|---------|--------------------------------------|
| `cmsUrl`      | string | `""`    | CMS base URL (e.g. `https://cms.example.com`) |
| `cmsKey`      | string | `""`    | CMS server key for authentication    |
| `displayName` | string | `""`    | Display name registered with the CMS |

These are set automatically by the PWA setup page on first run.

### Server

| Key          | Type   | Default          | Description                          |
|--------------|--------|------------------|--------------------------------------|
| `serverPort` | number | `8765` (Electron) / `8766` (Chromium) | Local proxy server port |

### Window & Display

| Key               | Type    | Default | Description                                  |
|-------------------|---------|---------|----------------------------------------------|
| `kioskMode`       | boolean | `true`  | Lock window in kiosk mode (no title bar, Alt+F4 disabled) |
| `fullscreen`      | boolean | `true`  | Start in fullscreen (ignored when `kioskMode` is true) |
| `hideMouseCursor` | boolean | `true`  | Hide the mouse cursor (Chromium uses `unclutter`) |
| `preventSleep`    | boolean | `true`  | Disable screen blanking and DPMS             |
| `width`           | number  | `1920`  | Window width (when not fullscreen/kiosk)      |
| `height`          | number  | `1080`  | Window height (when not fullscreen/kiosk)     |

### Logging

| Key        | Type   | Default | Description                                  |
|------------|--------|---------|----------------------------------------------|
| `logLevel` | string | `""`    | PWA log level: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `NONE`. Empty string = default (`WARNING`). |

The log level is passed to the PWA as a URL parameter (`?logLevel=...`).
It controls the `@xiboplayer/utils` logger output in the browser console.

**Priority chain** (highest wins):
1. Electron `--dev` flag (forces `DEBUG`)
2. Chromium `--log-level=DEBUG` flag (forces the given level)
3. `config.json` `logLevel` key
4. URL parameter `?logLevel=...` (set by 1-3 above)
5. `localStorage` key `xibo_log_level`
6. CMS display setting
7. Default: `WARNING`

You can also set the log level at runtime in the browser DevTools console:
```js
localStorage.setItem('xibo_log_level', 'DEBUG');
location.reload();
```

### Player Controls & Overlays

| Key        | Type   | Default | Description                                  |
|------------|--------|---------|----------------------------------------------|
| `controls` | object | —       | Enable on-screen player controls and overlays |

The `controls` object has two sub-sections:

```json
"controls": {
  "keyboard": {
    "debugOverlays": false,
    "setupKey": false,
    "playbackControl": false,
    "videoControls": false
  },
  "mouse": {
    "statusBarOnHover": false
  }
}
```

| Key                          | Description                                         |
|------------------------------|-----------------------------------------------------|
| `keyboard.debugOverlays`     | Enable keyboard shortcuts to toggle debug overlays (timeline, cache, status) |
| `keyboard.setupKey`          | Enable keyboard shortcut to open the setup/config screen |
| `keyboard.playbackControl`   | Enable keyboard shortcuts for playback (skip layout, pause) |
| `keyboard.videoControls`     | Enable keyboard shortcuts for video control (play/pause, seek) |
| `mouse.statusBarOnHover`     | Show the status bar when hovering the mouse at the bottom of the screen |

### Transport

| Key           | Type   | Default  | Description                          |
|---------------|--------|----------|--------------------------------------|
| `transport`   | string | `"auto"` | CMS transport: `auto`, `rest`, `soap` |

### Geolocation

| Key                | Type   | Default | Description                          |
|--------------------|--------|---------|--------------------------------------|
| `googleGeoApiKey`  | string | `""`    | Google Geolocation API key for weather widgets |

### Chromium-only

| Key                 | Type   | Default      | Description                          |
|---------------------|--------|--------------|--------------------------------------|
| `browser`           | string | `"chromium"` | Browser binary: `chromium`, `chrome`, or a custom path |
| `extraBrowserFlags` | string | `""`         | Additional Chromium command-line flags (space-separated) |

### Electron-only

| Key          | Type    | Default | Description                          |
|--------------|---------|---------|--------------------------------------|
| `autoLaunch` | boolean | `false` | Auto-start on login (registers with OS autostart) |

## Example: Debugging Config

```json
{
  "cmsUrl": "https://cms.example.com",
  "cmsKey": "yourKey",
  "displayName": "dev-display",

  "kioskMode": false,
  "fullscreen": false,
  "hideMouseCursor": false,
  "logLevel": "DEBUG",

  "controls": {
    "keyboard": {
      "debugOverlays": true,
      "setupKey": true,
      "playbackControl": true,
      "videoControls": true
    },
    "mouse": {
      "statusBarOnHover": true
    }
  }
}
```

## Example: Production Kiosk

```json
{
  "cmsUrl": "https://cms.example.com",
  "cmsKey": "yourKey",
  "displayName": "lobby-screen-1",
  "preventSleep": true
}
```

All other defaults (kiosk mode, fullscreen, hidden cursor, WARNING log level) apply automatically.

## CLI Flags

Both players accept CLI flags that override config.json values.

### Electron

```
electron . [flags]
  --dev                  Open DevTools + force DEBUG logging
  --no-kiosk             Disable kiosk mode
  --port=XXXX            Override server port
  --pwa-path=/path       Use local PWA build instead of installed
  --cms-url=URL          Override CMS URL
  --cms-key=KEY          Override CMS key
  --display-name=NAME    Override display name
  --instance=NAME        Run a separate instance with its own config
```

### Chromium

```
launch-kiosk.sh [flags]
  --no-kiosk             Disable kiosk mode
  --port=XXXX            Override server port
  --pwa-path=/path       Use local PWA build
  --log-level=LEVEL      Set log level (DEBUG, INFO, WARNING, ERROR)
  --instance=NAME        Run a separate instance with its own config
  --server-dir=/path     Override server directory
```
