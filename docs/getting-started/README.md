# Getting Started with Xibo Players

**New to Xibo Players?** This guide will help you get up and running quickly.

## 🎯 Choose Your Platform

Xibo Players supports multiple platforms. Choose the one that fits your needs:

### Progressive Web App (PWA)
**Best for**: Modern browsers, quick deployment, no installation

```bash
# Build PWA
cd platforms/pwa
npm install
npm run build

# Serve (production)
npx serve dist/
```

**Access**: Open browser to `http://localhost:3000`

### Desktop (Electron)
**Best for**: Kiosk mode on Linux/Windows/Mac

```bash
# Build Electron app
cd platforms/electron
npm install
npm run make

# Packages generated in out/make/
```

### Android
**Best for**: Tablets, Android-based displays

```bash
# Build Android APK
cd platforms/android
./gradlew assembleRelease
```

### Chrome Extension
**Best for**: Managed Chrome devices, Chromebox

```bash
# Build extension
cd platforms/chrome
npm install
npm run build
```

## 📋 Prerequisites

### All Platforms
- **Node.js**: v18 or later
- **npm**: v9 or later
- **Git**: For cloning the repository

### Platform-Specific
- **Electron**: No additional requirements
- **Android**: Android SDK, Java 17+
- **Chrome**: Chrome browser for testing

## 🚀 Quick Start (PWA)

### 1. Clone Repository

```bash
git clone https://github.com/xibo/xibo-players.git
cd xibo-players
```

### 2. Install Dependencies

```bash
# Install root dependencies (workspace setup)
npm install

# Install PWA dependencies
cd platforms/pwa
npm install
```

### 3. Configure CMS Connection

Create `platforms/pwa/public/config.json`:

```json
{
  "cmsUrl": "https://your-cms-url.com",
  "cmsKey": "your-cms-key",
  "displayId": 1,
  "hardwareKey": "auto"
}
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 5. Build for Production

```bash
npm run build
```

Production files will be in `dist/`.

## 🔧 Configuration

### Display Registration

1. Log into your Xibo CMS
2. Navigate to **Displays** → **Add Display**
3. Note the **Display ID** and **License Key**
4. Update `config.json` with these values

### Offline Mode

For offline kiosk deployments, see:
- [Offline Kiosk Mode Guide](../user-guides/OFFLINE_KIOSK_MODE.md)

## 📱 Platform-Specific Guides

- **PWA**: [PWA Deployment Guide](../developer-guides/DEPLOYMENT.md)
- **Electron**: `platforms/electron/README.md`
- **Android**: `platforms/android/README.md`
- **Chrome**: `platforms/chrome/README.md`

## ❓ Troubleshooting

### CMS Connection Issues

**Problem**: Player won't connect to CMS

**Solutions**:
1. Verify `cmsUrl` in config.json
2. Check network connectivity
3. Verify firewall allows HTTPS to CMS
4. Check browser console for errors

### Display Not Showing Layouts

**Problem**: Player registered but no content

**Solutions**:
1. Assign a schedule to the display in CMS
2. Verify layouts are published
3. Check display is in the correct Display Group
4. Wait for collection interval (default: 5 minutes)

### Performance Issues

**Problem**: Layouts load slowly

**Solutions**:
1. See [Performance Testing Guide](../technical-reference/PERFORMANCE_TESTING.md)
2. Check network speed
3. Verify Service Worker is active
4. Clear browser cache

## 📚 Next Steps

- **User Guide**: [Operating the Player](../user-guides/)
- **Architecture**: [System Design](../../packages/core/docs/ARCHITECTURE.md)
- **API Reference**: [Package Documentation](../../packages/)

## 🆘 Need Help?

- **Documentation**: [docs/](../)
- **Issues**: https://github.com/xibo/xibo-players/issues
- **Community**: https://community.xibo.org.uk/

---

**Last Updated**: 2026-02-10
