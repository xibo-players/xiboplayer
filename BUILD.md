# Build Guide

Complete guide for building the Xibo Player across all platforms.

## Prerequisites

- **Node.js**: 20.x or later
- **npm**: 10.x or later
- **Git**: For version control

Platform-specific requirements listed in each section.

## Quick Start

```bash
# Clone repository
git clone <repository-url>
cd xibo_players

# Install dependencies
npm install

# Build core PWA
npm run build:core

# Run tests
npm test

# Build all platforms
npm run build
```

## Monorepo Structure

```
xibo_players/
├── packages/
│   ├── core/              # Core PWA (TypeScript/JavaScript)
│   └── docs/              # Documentation
├── platforms/
│   ├── electron/          # Desktop player (Windows, Linux, macOS)
│   ├── chrome/            # Chrome extension
│   ├── android/           # Android APK
│   └── webos/             # LG webOS IPK
├── scripts/
│   ├── version.js         # Version synchronization
│   ├── release.js         # Release automation
│   └── test-license-bypass.js  # License validation
└── .github/workflows/
    └── release.yml        # CI/CD pipeline
```

## Building Core PWA

The core PWA is the foundation for all platform wrappers.

### Development Build

```bash
cd packages/core
npm run dev
```

Opens development server at `http://localhost:5173/player/`

**Features:**
- Hot module replacement (HMR)
- Source maps
- Fast refresh

### Production Build

```bash
npm run build:core
```

**Output:** `packages/core/dist/` (1.5MB)

**Contents:**
- `index.html` - Player page
- `setup.html` - Configuration page
- `assets/` - JavaScript bundles (gzipped)
- `pdf.worker.min.mjs` - PDF.js worker (1.4MB)
- `sw.js` - Service Worker for offline support
- `manifest.json` - PWA manifest

**Build Metrics:**
```
index.html:   1.7 KB (0.8 KB gzipped)
setup.html:   3.5 KB (1.2 KB gzipped)
main.js:    109 KB (34 KB gzipped)
xmds.js:      6 KB (2.3 KB gzipped)
PDF worker: 1.4 MB (separate file, lazy-loaded)
```

### Verify Build

```bash
# Check files exist
ls -lh packages/core/dist/

# Test locally
npm run preview -w packages/core
```

## Building Chrome Extension

Browser-based player packaged as Chrome extension.

### Prerequisites

- Chrome/Chromium browser for testing

### Build Process

```bash
# Build core first (if not already built)
npm run build:core

# Build extension
npm run build:chrome

# Create distributable zip
cd platforms/chrome
npm run package
```

**Output:** `platforms/chrome/dist/` + `xibo-player-chrome.zip`

### Testing Locally

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select `platforms/chrome/dist/`
5. Extension icon appears in toolbar

### Extension Structure

```
platforms/chrome/dist/
├── manifest.json          # Manifest V3
├── background.js          # Service worker
├── popup.html/popup.js    # Settings popup
├── icons/                 # Extension icons
└── player/                # Synced PWA files
```

## Building Electron (Desktop)

Cross-platform desktop player for Windows, Linux, and macOS.

### Prerequisites

- **Linux builds**:
  - `rpm` for RPM packages
  - `snapcraft` for Snap packages
- **Windows builds**: Windows machine or Wine
- **macOS builds**: macOS machine with Xcode

### Build Process

```bash
# Build core first
npm run build:core

# Build Electron app
npm run build:electron

# Create installers
cd platforms/electron
npm run make

# Create Snap package (Linux only)
npm run make:snap
```

**Output:** `platforms/electron/out/make/`

**Linux packages:**
- `.deb` - Debian/Ubuntu
- `.snap` - Universal Linux (snapcraft required)
- `.rpm` - Fedora/RHEL (optional)

**Windows packages:**
- `.exe` - Windows installer

**macOS packages:**
- `.dmg` - macOS disk image

### Platform-Specific Notes

**Linux Snap:**
```bash
# Install snapcraft
sudo snap install snapcraft --classic

# Build snap
cd platforms/electron
npm run make:snap
```

**Windows:**
- Requires Windows build machine or CI
- Uses Squirrel installer

**macOS:**
- Requires macOS machine
- Requires Apple Developer ID for signing (optional)

## Building Android APK

Android WebView wrapper for Android devices.

### Prerequisites

- **JDK**: 17 or later
- **Android SDK**: API level 33+
- **Gradle**: 8.0+ (included with wrapper)

### Setup Android SDK

```bash
# Install Android SDK via package manager
# Debian/Ubuntu:
sudo apt install android-sdk

# Or download from:
# https://developer.android.com/studio

# Set environment variables
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

### Build Process

```bash
# Build core first
npm run build:core

# Sync PWA to Android assets
cd platforms/android
mkdir -p app/src/main/assets
cp -r ../../packages/core/dist/* app/src/main/assets/

# Build APK
./gradlew assembleRelease

# Or use npm script
npm run build:android
```

**Output:** `platforms/android/app/build/outputs/apk/release/`

### Signing APK (Production)

```bash
# Generate keystore (first time only)
keytool -genkey -v -keystore xibo-release-key.jks \
  -alias xibo -keyalg RSA -keysize 2048 -validity 10000

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore xibo-release-key.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk xibo

# Align APK
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk \
  xibo-player.apk
```

### Testing on Device

```bash
# Enable USB debugging on Android device
# Connect device via USB

# Install APK
adb install app/build/outputs/apk/release/app-release.apk

# View logs
adb logcat | grep Xibo
```

## Building webOS (LG TVs)

Cordova-based wrapper for LG webOS smart TVs.

### Prerequisites

- **webOS SDK**: CLI tools for packaging
- **Node.js**: For Cordova

### Setup webOS SDK

```bash
# Download from:
# http://webostv.developer.lge.com/sdk/download/download-sdk/

# Install CLI tools
npm install -g @webos-tools/cli

# Verify installation
ares-package --version
```

### Build Process

```bash
# Build core first
npm run build:core

# Sync PWA to webOS app
cd platforms/webos
mkdir -p app/www
cp -r ../../packages/core/dist/* app/www/

# Build IPK package
npm run build:webos
# Or manually:
ares-package .
```

**Output:** `com.tecman.xibo_1.0.0_all.ipk`

### Testing on TV

```bash
# Add TV device (first time)
ares-setup-device

# Install on TV
ares-install --device tv com.tecman.xibo_1.0.0_all.ipk

# Launch app
ares-launch --device tv com.tecman.xibo

# View logs
ares-inspect --device tv --app com.tecman.xibo
```

## CI/CD Builds

Automated builds via GitHub Actions on git tag push.

### Trigger Release

```bash
# Sync versions
npm run sync-version

# Review changes
git diff

# Commit version changes
git commit -am "chore: bump version to 1.0.0"

# Create and push tag
git tag v1.0.0
git push origin v1.0.0
```

### What Gets Built

GitHub Actions automatically builds:
- ✅ Core PWA (tar.gz)
- ✅ Electron (Linux .deb/.snap, Windows .exe, macOS .dmg)
- ✅ Android APK (signed)
- ✅ Chrome extension (.zip)

All artifacts uploaded to GitHub Release.

### CI/CD Pipeline

```yaml
# .github/workflows/release.yml

1. Validate license bypass (CRITICAL - blocks if fails)
2. Build core PWA
3. Build platforms in parallel:
   - Electron (3 OS matrices)
   - Android (Gradle)
   - Chrome (npm)
4. Create GitHub Release
5. Upload all artifacts
```

## Troubleshooting

### Core Build Fails

**Issue:** `PDF.js worker not found`

**Solution:**
```bash
# Check node_modules
ls -la node_modules/pdfjs-dist/build/

# Reinstall
npm ci
```

**Issue:** `Vite build fails`

**Solution:**
```bash
# Clear cache
rm -rf node_modules/.vite
npm run build
```

### Electron Build Fails

**Issue:** `electron-forge not found`

**Solution:**
```bash
cd platforms/electron
npm install
```

**Issue:** Snap build fails

**Solution:**
```bash
# Install snapcraft
sudo snap install snapcraft --classic

# Clean build
snapcraft clean
npm run make:snap
```

### Android Build Fails

**Issue:** `ANDROID_HOME not set`

**Solution:**
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/tools
```

**Issue:** Gradle build fails

**Solution:**
```bash
cd platforms/android
./gradlew clean
./gradlew assembleRelease
```

### webOS Build Fails

**Issue:** `ares-package not found`

**Solution:**
```bash
npm install -g @webos-tools/cli
```

## Version Management

All platform versions are synchronized from core version.

### Update Versions

```bash
# Edit core version
vi packages/core/package.json
# Change "version": "1.0.0" to "1.0.1"

# Sync all platforms
npm run sync-version
```

**This updates:**
- Electron: `1.0.1-electron.TIMESTAMP`
- Chrome: `1.0.1`
- Android: `versionCode` calculated from semver
- webOS: `1.0.1`

### Version Validation

```bash
# Verify license bypass preserved
npm test

# Should pass all 7 tests
```

## Build Artifacts

Summary of all build outputs:

| Platform | Output | Size | Format |
|----------|--------|------|--------|
| Core PWA | `packages/core/dist/` | 1.5 MB | Directory |
| Chrome | `xibo-player-chrome.zip` | ~1.5 MB | ZIP |
| Electron (Linux) | `xibo-player_1.0.0_amd64.deb` | ~80 MB | DEB |
| Electron (Linux) | `xibo-player_1.0.0_amd64.snap` | ~90 MB | SNAP |
| Electron (Windows) | `xibo-player-Setup-1.0.0.exe` | ~80 MB | EXE |
| Electron (macOS) | `xibo-player-1.0.0.dmg` | ~85 MB | DMG |
| Android | `xibo-player.apk` | ~5 MB | APK |
| webOS | `com.tecman.xibo_1.0.0_all.ipk` | ~2 MB | IPK |

## Performance Optimization

### Production Build Tips

1. **Enable gzip** on web server
2. **Use CDN** for static assets (optional)
3. **Enable HTTP/2** for multiplexing
4. **Set cache headers** for immutable assets

### Bundle Analysis

```bash
# Analyze bundle size
cd packages/core
npm run build -- --mode production

# View build stats
cat dist/stats.json
```

## Next Steps

- [Deployment Guide](DEPLOYMENT.md) - How to deploy builds
- [Testing Guide](TESTING.md) - How to test each platform
- [Architecture](ARCHITECTURE.md) - Technical details
- [Release Process](RELEASE.md) - Creating official releases
