# webOS Signage Player

webOS wrapper application for the Xibo PWA digital signage player. Loads the PWA player inside a full-screen iframe and handles webOS-specific platform concerns (screen saver suppression, remote control lockdown, network monitoring, lifecycle events).

## Architecture

```
LG webOS TV
  |
  +-- webOS App (this package, IPK)
  |     |
  |     +-- index.html
  |     +-- js/app.js  -- platform glue: keep-alive, remote keys, network monitor
  |     |
  |     +-- <iframe>  -----> PWA Player URL (configurable)
  |                            https://h1.superpantalles.com:8081/player/pwa/
  |                            |
  |                            +-- PlayerCore + RendererLite + XMDS/REST
  |                            +-- Service Worker (offline cache)
  |                            +-- Full CMS integration (schedule, stats, logs)
```

The webOS app is intentionally thin. All player logic (scheduling, rendering, CMS communication, caching) runs inside the PWA player loaded via iframe. The webOS shell only provides:

- **Screen saver suppression** via Luna service calls
- **Remote control lockdown** (kiosk mode, no exit on BACK/HOME)
- **Network monitoring** with exponential-backoff auto-reconnect
- **Lifecycle handling** (suspend/resume, visibility changes)
- **Debug overlay** toggled via GREEN remote button

## Prerequisites

### 1. Install webOS CLI Tools

```bash
npm install -g @webosose/ares-cli
```

Or download the webOS SDK from: https://www.webosose.org/docs/tools/sdk/cli/cli-user-guide/

### 2. Setup a webOS Device

Register your TV (or emulator) as a development device:

```bash
# Add a device
ares-setup-device --add myTV --info "{\
  \"host\": \"192.168.1.100\",\
  \"port\": 9922,\
  \"username\": \"prisoner\"\
}"

# Verify connection
ares-device-info --device myTV
```

For LG Signage TVs, enable Developer Mode via the TV settings menu and note the IP address.

### 3. Generate PNG Icons

The repository includes SVG source files. Convert them to PNG before building:

```bash
# Using rsvg-convert (recommended)
rsvg-convert -w 80  -h 80  icon.svg      -o icon.png
rsvg-convert -w 130 -h 130 largeIcon.svg  -o largeIcon.png

# Or using ImageMagick
convert -background none -resize 80x80   icon.svg   icon.png
convert -background none -resize 130x130 largeIcon.svg largeIcon.png

# Background image (1920x1080 black)
convert -size 1920x1080 xc:black bgImage.png
```

The build script (`build-ipk.sh`) attempts this automatically if `rsvg-convert` or `convert` is available.

## Configuration

### Setting the CMS URL

The PWA player URL can be configured in three ways (checked in this order):

1. **URL parameter** (useful for testing):
   ```
   file:///path/to/index.html?cmsUrl=https://my-cms.example.com/player/pwa/
   ```

2. **localStorage** (persists across reboots):
   ```javascript
   // In the webOS app's web inspector console:
   localStorage.setItem('webos_cms_url', 'https://my-cms.example.com/player/pwa/');
   location.reload();
   ```

3. **Default constant** in `js/app.js`:
   ```javascript
   var DEFAULT_CMS_URL = 'https://h1.superpantalles.com:8081/player/pwa/';
   ```
   Override at build time:
   ```bash
   ./build-ipk.sh --cms-url "https://my-cms.example.com/player/pwa/"
   ```

## Building

### Using the build script

```bash
# Make executable (first time only)
chmod +x build-ipk.sh

# Build with default CMS URL
./build-ipk.sh

# Build with custom CMS URL baked in
./build-ipk.sh --cms-url "https://my-cms.example.com/player/pwa/"
```

Output: `dist/com.tecman.xiboplayer_1.0.0_all.ipk`

### Manual build

```bash
ares-package --outdir dist/ .
```

## Deploying to a webOS Device

### Install the IPK

```bash
ares-install --device myTV dist/com.tecman.xiboplayer_1.0.0_all.ipk
```

### Launch the app

```bash
ares-launch --device myTV com.tecman.xiboplayer
```

### View logs (remote debugging)

```bash
ares-inspect --device myTV --app com.tecman.xiboplayer --open
```

This opens Chrome DevTools connected to the app's WebView, allowing you to see console logs, inspect the DOM, and debug JavaScript.

### Uninstall

```bash
ares-install --device myTV --remove com.tecman.xiboplayer
```

## Setting as Autostart App

On LG webOS Signage displays, you can set the app to launch automatically on boot:

### Method 1: Luna Service (programmatic)

```bash
# Via ares-shell
ares-shell --device myTV -r "luna-send -n 1 luna://com.webos.service.config/setConfigs '{\"configs\":{\"com.webos.app.inputcommon.autoStart\":\"com.tecman.xiboplayer\"}}'"
```

### Method 2: Signage Mode Settings

On LG commercial signage displays:
1. Enter the Installation Menu (usually via a special remote sequence)
2. Navigate to **Application** > **Auto Start**
3. Select **com.tecman.xiboplayer**

### Method 3: SIServer (LG SI Server)

If the display is managed via LG's SI Server platform:
1. Upload the IPK to the SI Server
2. Create a deployment configuration with auto-start enabled
3. Push to target displays

## Remote Control Button Mapping

| Button | Action |
|--------|--------|
| **BACK** | Suppressed (kiosk mode) |
| **HOME/EXIT** | Suppressed (kiosk mode) |
| **RED** | Reload the player iframe |
| **GREEN** | Toggle debug info overlay |
| **YELLOW** | (Reserved for future config) |
| **BLUE** | Force reconnect |
| **OK/Enter** | Passed through to player |
| **Arrow keys** | Passed through to player |
| **Media keys** | Passed through to player |

## Network Behavior

The app monitors network connectivity using both browser events and webOS Luna service subscriptions:

1. **Network loss detected**: Shows "OFFLINE" indicator, player continues with cached content
2. **Network restored**: Schedules reconnect with exponential backoff (3s, 6s, 12s, ... up to 60s)
3. **Reconnect success**: Hides overlay, resets reconnect counter
4. **Max attempts reached** (50): Shows persistent error, press BLUE to retry manually

## Directory Structure

```
webos/
├── appinfo.json          # webOS app manifest
├── index.html            # Entry point (loads iframe + app.js)
├── js/
│   └── app.js            # Platform logic (keep-alive, keys, network)
├── css/
│   └── style.css         # Full-screen kiosk styling
├── icon.svg              # App icon source (80x80)
├── largeIcon.svg         # Large icon source (130x130)
├── build-ipk.sh          # Build script
├── dist/                 # Build output (IPK files)
└── README.md             # This file
```

## Troubleshooting

### App shows black screen

- Check the CMS URL is correct and reachable from the TV's network
- Open remote inspector (`ares-inspect`) and check console for errors
- Try loading the CMS URL directly in the TV's built-in browser

### Screen saver keeps activating

- The app uses multiple Luna service strategies to suppress the screen saver
- Some webOS versions may require additional configuration in the TV's service menu
- For commercial signage displays, set "Screen Saver" to "Off" in the Installation Menu

### Player disconnects frequently

- Check network stability between TV and CMS server
- The app uses exponential backoff reconnection (up to 60s between attempts)
- Press BLUE button on remote to force an immediate reconnect

### Cannot install IPK

- Ensure Developer Mode is enabled on the TV
- Check that the device is registered: `ares-device-info --device myTV`
- Verify SSH connectivity: `ares-shell --device myTV`

## webOS Version Compatibility

| webOS Version | TV Series | Status |
|---------------|-----------|--------|
| webOS 3.x | 2016+ LG TVs | Should work (Luna APIs may vary) |
| webOS 4.x | 2018+ LG TVs | Supported |
| webOS 5.x | 2020+ LG TVs | Supported |
| webOS 6.x | 2021+ LG TVs | Supported |
| webOS 22/23 | 2022-2023 LG TVs | Supported |
| webOS OSE | Open Source Edition | Supported |
| webOS Signage | LG Commercial Displays | Primary target |
