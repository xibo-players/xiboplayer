# Testing Guide

Comprehensive testing procedures for all platforms and features.

## Table of Contents

- [Automated Tests](#automated-tests)
- [PWA Testing](#pwa-testing)
- [Chrome Extension Testing](#chrome-extension-testing)
- [Electron Testing](#electron-testing)
- [Android Testing](#android-testing)
- [webOS Testing](#webos-testing)
- [Integration Testing](#integration-testing)

## Automated Tests

Run automated test suite before any release.

### License Bypass Validation

**Most critical test** - ensures commercial license bypass is preserved.

```bash
# Run all tests
npm test

# Run license bypass test directly
node scripts/test-license-bypass.js
```

**Expected output:**
```
🔒 License Bypass Validation Test

✓ xmds.js exists
✓ xmds.js contains clientType: 'linux'
✓ clientType: 'linux' is in RegisterDisplay method
✓ clientType: 'linux' is not commented out
✓ Warning comment present near clientType
✓ No commercial clientType values found
✓ Electron config returns 'linux' for player type

──────────────────────────────────────────────────
Tests passed: 7
Tests failed: 0
──────────────────────────────────────────────────

✓ License bypass validation PASSED
```

**If this test fails:**
- **DO NOT RELEASE**
- The `clientType: 'linux'` has been removed or modified
- This will cause commercial license requirements
- Fix immediately before proceeding

### Build Validation

```bash
# Build and verify
npm run build:core
npm test

# Check build output
ls -lh packages/core/dist/

# Verify critical files exist
test -f packages/core/dist/index.html && echo "✓ index.html"
test -f packages/core/dist/setup.html && echo "✓ setup.html"
test -f packages/core/dist/pdf.worker.min.mjs && echo "✓ PDF worker"
test -f packages/core/dist/sw.js && echo "✓ Service Worker"
```

## PWA Testing

Test the core Progressive Web App in browsers.

### Development Testing

```bash
# Start dev server
npm run dev -w packages/core

# Opens at: http://localhost:5173/player/
```

### Production Testing

```bash
# Build production version
npm run build:core

# Serve with production server
npm run preview -w packages/core

# Or deploy to test server
curl -I https://displays.superpantalles.com/player/
```

### Browser Testing Matrix

Test in multiple browsers:

| Browser | Version | Platform | Status |
|---------|---------|----------|--------|
| Chrome | Latest | Desktop | ✅ Primary |
| Firefox | Latest | Desktop | ✅ Supported |
| Safari | Latest | macOS | ✅ Supported |
| Edge | Latest | Windows | ✅ Supported |
| Chrome | Latest | Android | ✅ Mobile |
| Safari | Latest | iOS | ⚠️ Limited |

### Setup Page Testing

**URL:** https://displays.superpantalles.com/player/setup.html

**Test cases:**

1. **Empty form validation:**
   - Leave all fields empty
   - Click "Save"
   - Should show validation errors

2. **Valid configuration:**
   - CMS Address: `https://displays.superpantalles.com`
   - CMS Key: `isiSdUCy`
   - Hardware Key: Generate or use existing
   - Display Name: `test-display`
   - Click "Save"
   - Should redirect to main player

3. **Invalid CMS address:**
   - Enter malformed URL
   - Should show error

4. **Configuration persistence:**
   - Configure display
   - Reload page
   - Should remain configured (localStorage)

### Main Player Testing

**URL:** https://displays.superpantalles.com/player/

Open browser DevTools (F12) → Console tab

#### XMDS Connection Test

**Expected console output:**
```javascript
[Player] Initializing...
[Player] Cache initialized
[Player] Starting collection cycle
[Player] RegisterDisplay: READY Display authorized
[Player] Settings updated: {collectInterval: 900000, ...}
[Player] Required files: 3
[Player] Required files: ...
[Player] Schedule: [...]
```

**Check XMDS SOAP request:**
1. Open DevTools → Network tab
2. Filter: `XHR`
3. Find `xmds.php` request
4. View request payload
5. Verify contains: `<clientType>linux</clientType>`

**Test cases:**

1. **Successful registration:**
   - Status: `READY`
   - Message: "Display authorized"
   - Settings object populated

2. **Unauthorized display:**
   - Status: `waiting`
   - Message shows waiting for authorization
   - Check CMS admin panel to authorize

3. **Invalid CMS key:**
   - Error message displayed
   - Check console for details

#### XMR Real-Time Testing

**Prerequisites:**
- CMS has XMR enabled
- Firewall allows port 9505/tcp

**Expected console output:**
```javascript
[XMR] Initializing connection to: wss://displays.superpantalles.com/xmr
[XMR] WebSocket connected
[XMR] Connected successfully
```

**Test cases:**

1. **XMR connection:**
   - Check console for "XMR Connected"
   - DevTools → Network → WS tab
   - Should show WebSocket connection

2. **Collect Now command:**
   - From CMS: Displays → Select display → "Send Command" → "Collect Now"
   - Console should show: `[XMR] Received collectNow command`
   - Player immediately starts collection cycle

3. **XMR unavailable (fallback):**
   - If XMR fails, console shows: `[XMR] Continuing in polling mode`
   - Player still works via XMDS polling

#### Cache Testing

**Test cases:**

1. **Initial cache:**
   - DevTools → Application → Cache Storage
   - Should show `xibo-media-v1` cache
   - Contains downloaded media files

2. **Service Worker:**
   - DevTools → Application → Service Workers
   - Should show `sw.js` registered and active

3. **Offline mode:**
   - Load player normally
   - DevTools → Network → Toggle "Offline"
   - Reload page
   - Should still work from cache

#### Schedule Testing

**Test cases:**

1. **No scheduled content:**
   - Message: "No layout scheduled"

2. **Scheduled layout:**
   - Create layout in CMS
   - Schedule to display
   - Wait for collection cycle
   - Layout should appear

3. **Multiple layouts:**
   - Schedule multiple layouts with different times
   - Verify correct layout shows at correct time

#### PDF Media Testing

**Prerequisites:**
- Upload PDF to CMS library
- Add to layout
- Schedule layout to display

**Expected behavior:**
1. PDF downloads to cache
2. Console shows: `[PDF] Rendered: /cache/media/file.pdf`
3. PDF displays in region with correct scaling
4. Duration from CMS is respected

**Test cases:**

1. **Single-page PDF:**
   - Should render first page
   - Scaled to fit region

2. **Multi-page PDF:**
   - Shows first page only
   - (Multi-page rotation not yet implemented)

3. **PDF unavailable:**
   - Shows error message in region
   - Console shows error details

### Performance Testing

**Metrics to check:**

```javascript
// In browser console:
performance.getEntriesByType('navigation')[0].loadEventEnd
// Should be < 3000ms

// Check bundle sizes
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('.js'))
  .map(r => ({name: r.name.split('/').pop(), size: (r.transferSize/1024).toFixed(2) + 'KB'}))
```

**Expected metrics:**
- Initial load: < 3 seconds
- Main bundle: ~110 KB (34 KB gzipped)
- XMDS call: < 2 seconds
- First paint: < 1 second

### Security Testing

1. **HTTPS only:**
   - Try HTTP: http://displays.superpantalles.com/player/
   - Should redirect to HTTPS

2. **Content Security Policy:**
   - Check headers for CSP
   - No inline scripts (all external)

3. **Service Worker scope:**
   - Only controls `/player/` routes
   - Doesn't interfere with other site routes

## Chrome Extension Testing

Test extension in Chrome browser.

### Installation Testing

1. **Load unpacked:**
   ```bash
   npm run build:chrome
   ```
   - Chrome → `chrome://extensions/`
   - Enable "Developer mode"
   - Load unpacked: `platforms/chrome/dist/`
   - Extension icon appears

2. **First launch:**
   - Click extension icon
   - Shows "Not configured" status
   - Click "Configure Settings"
   - Opens setup page in new tab

### Popup Testing

**Test cases:**

1. **Unconfigured state:**
   - Status: "⚠️ Not configured"
   - "Configure Settings" button visible

2. **Configured state:**
   - Status: "✓ Configured and ready"
   - Shows CMS address, display name
   - "Open Player" button enabled

3. **Open player:**
   - Click "Open Player"
   - Opens player in new tab
   - Or focuses existing player tab

### Background Service Worker Testing

**DevTools → Extensions → Service Worker → Inspect:**

```javascript
// Console should show:
"Xibo Player background service worker ready"

// Test alarm
chrome.alarms.get('xibo-collect', (alarm) => {
  console.log('Collection alarm:', alarm);
});
```

**Test cases:**

1. **Keep-alive:**
   - Service worker stays active
   - Doesn't timeout after 30 seconds

2. **Message passing:**
   ```javascript
   // From player page console:
   chrome.runtime.sendMessage({action: 'getConfig'}, (config) => {
     console.log('Config:', config);
   });
   ```

3. **Storage:**
   ```javascript
   // Check stored config:
   chrome.storage.local.get(['config'], (result) => {
     console.log('Stored config:', result.config);
   });
   ```

## Electron Testing

Test desktop application on all platforms.

### Linux Testing

**Install and launch:**
```bash
# Install DEB
sudo dpkg -i xibo-player_1.0.0_amd64.deb
xibo-player

# Or Snap
sudo snap install xibo-player_1.0.0_amd64.snap --dangerous
xibo-player
```

**Test cases:**

1. **First launch:**
   - Window opens maximized (or fullscreen)
   - Shows setup page

2. **Configuration:**
   - Fill in CMS details
   - Save configuration
   - Should persist across restarts

3. **Auto-update:**
   - Check for updates menu
   - (If update server configured)

4. **Kiosk mode:**
   - F11 toggles fullscreen
   - ESC exits fullscreen

5. **System tray:**
   - Icon appears in system tray
   - Right-click shows menu
   - "Quit" exits application

### Windows Testing

**Install and launch:**
```powershell
# Run installer
.\xibo-player-Setup-1.0.0.exe

# Launch from Start menu
```

**Test cases:**
- Same as Linux above
- Plus: Windows-specific shortcuts
- Auto-start on login (if configured)

### macOS Testing

**Install and launch:**
```bash
# Open DMG
open xibo-player-1.0.0.dmg

# Copy to Applications
# Launch from Applications folder
```

**Test cases:**
- Same as Linux above
- Plus: macOS menu bar integration
- Dock icon behavior

### Cross-Platform Testing

**Features to test on all platforms:**

1. **Window management:**
   - Minimize/maximize/close
   - Fullscreen mode
   - Multiple displays (if available)

2. **Player functionality:**
   - XMDS connection
   - XMR real-time (same as PWA)
   - Media playback
   - PDF rendering

3. **Performance:**
   - CPU usage (should be < 10% idle)
   - Memory usage (should be < 500 MB)
   - No memory leaks over 24 hours

4. **Stability:**
   - No crashes over 24 hours
   - Graceful error recovery
   - Auto-restart on crash (if configured)

## Android Testing

Test on Android devices.

### Installation Testing

```bash
# Install APK
adb install platforms/android/app/build/outputs/apk/release/app-release.apk

# Launch
adb shell am start -n com.tecman.xibo/.MainActivity

# View logs
adb logcat | grep Xibo
```

**Test cases:**

1. **First launch:**
   - Permission prompts (if any)
   - Shows setup page in WebView

2. **WebView functionality:**
   - JavaScript enabled
   - Local storage works
   - Service Worker registers

3. **Kiosk mode (if enabled):**
   - Home button disabled
   - Back button disabled
   - Status bar hidden
   - Can't switch apps

### Device Testing Matrix

Test on multiple devices:

| Device | Android Version | Screen Size | Status |
|--------|----------------|-------------|--------|
| Pixel 6 | 13 | 6.4" | ✅ Primary |
| Galaxy Tab | 12 | 10.1" | ✅ Tablet |
| Fire TV Stick | 9 | TV | ⚠️ Limited |
| Budget Phone | 10 | 5.5" | ✅ Minimum |

### Performance Testing

```bash
# Check CPU usage
adb shell top | grep xibo

# Check memory usage
adb shell dumpsys meminfo com.tecman.xibo

# Check battery usage
adb shell dumpsys batterystats | grep xibo
```

**Expected metrics:**
- CPU: < 15% average
- Memory: < 300 MB
- Battery: < 5% drain per hour (idle)

## webOS Testing

Test on LG webOS smart TVs.

### Installation Testing

```bash
# Install IPK
ares-install --device tv com.tecman.xibo_1.0.0_all.ipk

# Launch
ares-launch --device tv com.tecman.xibo

# View logs
ares-inspect --device tv --app com.tecman.xibo
```

**Test cases:**

1. **First launch on TV:**
   - App appears in app launcher
   - Opens in fullscreen
   - Shows setup page

2. **TV remote control:**
   - Navigate setup form with D-pad
   - Select fields with OK button
   - Enter text with on-screen keyboard

3. **Resolution:**
   - 1920x1080 (Full HD)
   - 3840x2160 (4K) if supported
   - Layout scales correctly

### TV Model Testing

Test on different LG TV models:

| Model | webOS Version | Resolution | Status |
|-------|--------------|------------|--------|
| LG C1 OLED | webOS 6.0 | 4K | ✅ Primary |
| LG UM7300 | webOS 4.5 | Full HD | ✅ Supported |
| LG 43UK6300 | webOS 4.0 | 4K | ⚠️ Minimum |

### Performance Testing

**Metrics to monitor:**
- App launch time: < 5 seconds
- Memory usage: < 200 MB
- No video stuttering
- Smooth layout transitions

## Integration Testing

Test complete workflows end-to-end.

### CMS Integration Test

**Prerequisites:**
- Running Xibo CMS instance
- Admin access to CMS

**Test workflow:**

1. **Display Registration:**
   - Configure player with CMS details
   - Player calls `RegisterDisplay`
   - Display appears in CMS "Displays" list
   - Status: "Waiting for authorization"

2. **Authorization:**
   - Admin authorizes display in CMS
   - Player next collection cycle
   - Status changes to "Authorized"

3. **Content Assignment:**
   - Create simple layout in CMS
   - Add image media
   - Schedule to display
   - Wait for collection cycle
   - Layout appears on player

4. **Real-Time Command:**
   - Send "Collect Now" from CMS
   - Player immediately collects
   - New content appears

5. **Status Reporting:**
   - Player reports status to CMS
   - Last accessed time updates
   - Currently playing layout shown

### Multi-Display Test

**Test with multiple players:**

1. Configure 3+ displays
2. Schedule different content to each
3. Verify each plays correct content
4. Send commands to specific displays
5. Check load on CMS

**Expected:**
- CMS handles concurrent connections
- No cross-contamination of content
- Each display operates independently

### Failover Test

**Test graceful degradation:**

1. **CMS offline:**
   - Stop CMS service
   - Player should continue with cached content
   - Shows last known schedule
   - Retries connection periodically

2. **Network intermittent:**
   - Simulate packet loss
   - Player should retry failed requests
   - No crashes or hangs

3. **XMR unavailable:**
   - Disable XMR service
   - Player falls back to XMDS polling
   - Everything still works

### Load Testing

**Simulate production load:**

```bash
# Start multiple players simultaneously
for i in {1..50}; do
  # Open player in new browser tab
  # Or start multiple Android emulators
done

# Monitor CMS:
# - Database connections
# - Response times
# - Error rates
```

**Acceptable metrics:**
- 50 concurrent displays
- < 2 second RegisterDisplay response
- < 5 second RequiredFiles response
- No errors in CMS logs

## Pre-Release Checklist

Before any release, verify:

- [ ] All automated tests pass (`npm test`)
- [ ] License bypass test passes (7/7 tests)
- [ ] Core PWA builds without errors
- [ ] All platforms build successfully
- [ ] PWA tested in Chrome, Firefox, Safari
- [ ] Chrome extension loads and works
- [ ] Electron tested on Linux (minimum)
- [ ] Android APK installs and runs
- [ ] webOS IPK installs on TV (if available)
- [ ] XMDS connection works
- [ ] XMR real-time commands work
- [ ] PDF media renders correctly
- [ ] Service Worker caches assets
- [ ] Offline mode works
- [ ] No console errors
- [ ] Performance metrics acceptable
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version numbers synchronized

## Reporting Issues

When filing bug reports, include:

1. **Platform:** PWA/Chrome/Electron/Android/webOS
2. **Version:** Output of `git describe --tags`
3. **Browser/OS:** Chrome 120 / Windows 11
4. **CMS Version:** Xibo 3.x or 4.x
5. **Steps to reproduce**
6. **Expected behavior**
7. **Actual behavior**
8. **Console logs** (DevTools → Console, all messages)
9. **Network logs** (DevTools → Network, HAR export)
10. **Screenshots/video** if applicable

## Next Steps

- [Build Guide](BUILD.md) - How to build for testing
- [Deployment Guide](DEPLOYMENT.md) - How to deploy
- [Architecture](ARCHITECTURE.md) - Technical details
