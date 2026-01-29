# PWA Player Deployment Guide

Complete guide for deploying the Xibo PWA player to production.

## Architecture Overview

```
User Browser
    ↓ HTTPS
https://displays.superpantalles.com/player/
    ↓
SWAG (Reverse Proxy, Port 443)
    ↓ Proxy
Xibo cms-web container (Port 8081)
    ↓ Serve
/var/www/cms/web/player/ (Podman volume: xibo-player-storage)
    ↓
PWA Player Files (HTML/JS/CSS)
```

**Same origin = No CORS issues!**

Player at `displays.superpantalles.com/player/` makes XMDS requests to `displays.superpantalles.com/xmds.php` - same domain, no cross-origin restrictions.

## Prerequisites

1. Xibo CMS deployed via Ansible (tecman_ansible)
2. SWAG reverse proxy running
3. Node.js and npm installed locally
4. Access to Ansible control machine

## Deployment Process

### Step 1: Test with CORS Proxy (REQUIRED)

Before deploying to production, test the player locally using the CORS proxy.

```bash
# Terminal 1: Start CORS proxy
cd ~/Devel/tecman/xibo_players/core
CMS_URL=https://displays.superpantalles.com npm run proxy

# Terminal 2: Start dev server
npm run dev
```

**Testing checklist:**
1. Open http://localhost:5173
2. Click through to setup page
3. Enter:
   - CMS Address: `http://localhost:8080` (the proxy)
   - CMS Key: Your actual CMS key
   - Display Name: Test Display
4. Click Connect
5. Open browser console (F12)
6. Verify:
   - RegisterDisplay succeeds (check console logs)
   - RequiredFiles succeeds
   - Files download with MD5 verification passes
   - Layouts translate to HTML (check console logs)
   - Layouts render on screen
7. Check CMS admin UI:
   - New display appears in Displays list
   - Authorize the display
   - Refresh player setup page
8. Verify player starts and shows layouts

**If any test fails, debug before proceeding to production.**

### Step 2: Build PWA for Production

```bash
cd ~/Devel/tecman/xibo_players/core

# Install dependencies (if not done)
npm install

# Build production bundle
npm run build
```

Output: `dist/` directory containing:
- `index.html`
- `setup.html`
- `manifest.json`
- `sw.js`
- `assets/` (minified JS/CSS with hashes)

### Step 3: Redeploy Xibo with Player Volume

The player volume has been added to the Xibo pod manifest. Redeploy Xibo to create the volume:

```bash
cd ~/Devel/tecman/tecman_ansible

# Redeploy Xibo (creates xibo-player-storage volume)
ansible-playbook playbooks/services/install.yml \
  -e service=xibo \
  --become \
  --become-user=pau
```

This will:
1. Create `xibo-player-storage` Podman volume (1GB)
2. Mount it at `/var/www/cms/web/player/` in cms-web container
3. Restart Xibo pod with new configuration

**Note:** Xibo will restart during this process (~30 seconds downtime).

### Step 4: Deploy Player Files to Volume

```bash
cd ~/Devel/tecman/tecman_ansible

# Deploy PWA files to xibo-player-storage volume
ansible-playbook playbooks/services/deploy-player.yml \
  --become \
  --become-user=pau
```

This copies `~/Devel/tecman/xibo_players/core/dist/*` to the player volume.

### Step 5: Verify Deployment

```bash
# Check volume exists
podman volume ls | grep xibo-player-storage

# Check files in volume
ls -la ~/.local/share/containers/storage/volumes/xibo-player-storage/_data/

# Check Xibo container can see the files
podman exec -it xibo-cms-web ls -la /var/www/cms/web/player/
```

### Step 6: Test Production

1. Open: `https://displays.superpantalles.com/player/`
2. Should see player or auto-redirect to setup
3. If not configured, setup with:
   - CMS Address: `https://displays.superpantalles.com`
   - CMS Key: Your actual key
   - Display Name: Production Display
4. Should connect without CORS errors
5. Should download and display layouts

**Browser console should show:**
```
[XMDS] RegisterDisplay ...
[Player] RegisterDisplay: READY Display is active and ready to start.
[Player] Settings updated: ...
[XMDS] RequiredFiles ...
[Player] Required files: N
[Cache] Downloading layout/123 ...
[Player] Collection cycle complete
```

## Updating the Player

When you make changes to the player code:

```bash
# 1. Test locally first
cd ~/Devel/tecman/xibo_players/core
npm run dev
# ... test changes ...

# 2. Build production bundle
npm run build

# 3. Deploy to Xibo volume
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-player.yml --become --become-user=pau

# 4. Clear browser cache and reload
# Player should update immediately (service worker updates)
```

## Multi-Platform Usage

### Web Browser (Any Device)

Direct access:
```
https://displays.superpantalles.com/player/
```

Works on:
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (Android, iOS)
- Tablets
- Smart TVs with browsers

Can be installed as PWA for fullscreen/offline use.

### Android (Native Wrapper)

The Android app loads the SWAG-hosted player in a WebView:

```kotlin
// MainActivity.kt
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.loadUrl("https://displays.superpantalles.com/player/")

        setContentView(webView)
    }
}
```

**No separate player deployment needed** - just build and distribute the APK.

### webOS (Cordova Wrapper)

The webOS app loads the SWAG-hosted player:

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script>
        window.location.href = 'https://displays.superpantalles.com/player/';
    </script>
</head>
<body></body>
</html>
```

**No separate player deployment needed** - just build and install the IPK.

### Chrome OS

Install directly as PWA:
1. Open `https://displays.superpantalles.com/player/`
2. Click install button in address bar
3. App installs as standalone application

## Troubleshooting

### Player doesn't load

```bash
# Check Xibo container is running
podman ps | grep xibo

# Check player files exist in volume
ls ~/.local/share/containers/storage/volumes/xibo-player-storage/_data/

# Check Xibo container can access files
podman exec -it xibo-cms-web ls -la /var/www/cms/web/player/

# Check Apache serves the path
curl -I https://displays.superpantalles.com/player/
```

### CORS errors still appearing

This shouldn't happen with same-origin deployment. If it does:
- Verify you're using `https://displays.superpantalles.com` as CMS address (not localhost or IP)
- Check browser console for actual error
- Verify SWAG is properly proxying to Xibo

### Layouts don't display

```bash
# Check browser console for:
# - XMDS errors (auth failures, network issues)
# - File download errors (404, MD5 mismatch)
# - Layout translation errors (invalid XLF)

# Check Xibo CMS:
# - Display is authorized
# - Layouts are assigned to display
# - Files are published
```

### Service worker not caching

```bash
# Check browser console → Application tab → Service Workers
# Should show: "Service Worker registered"

# Clear cache and reload:
# Chrome: Ctrl+Shift+Delete → Clear cached images and files
```

## File Locations

### Development

```
~/Devel/tecman/xibo_players/core/
├── src/          - Source code
├── public/       - Static assets
├── dist/         - Built bundle (after npm run build)
└── node_modules/ - Dependencies
```

### Production (Podman Volume)

```
~/.local/share/containers/storage/volumes/xibo-player-storage/_data/
├── index.html
├── setup.html
├── manifest.json
├── sw.js
└── assets/
    ├── main-[hash].js
    ├── main-[hash].css
    └── ...
```

### Inside Xibo Container

```
/var/www/cms/web/player/
├── index.html
├── setup.html
├── manifest.json
├── sw.js
└── assets/
```

Served by Apache at: `https://displays.superpantalles.com/player/`

## Security Notes

- Player uses `clientType: "linux"` to bypass commercial licenses
- XMDS authentication via serverKey + hardwareKey
- HTTPS enforced by SWAG
- Service worker only caches same-origin resources
- localStorage scoped to origin (data stays local)

## Performance

- **First load**: ~500KB transfer (minified bundle)
- **Subsequent loads**: Cached by service worker (instant)
- **Layout rendering**: Client-side (no server load)
- **XMDS calls**: Every 15 minutes by default (configurable)

## Updating Xibo CMS

Player deployment is independent of Xibo CMS updates. When updating Xibo:

```bash
# Update Xibo CMS version
ansible-playbook playbooks/services/install.yml -e service=xibo --become --become-user=pau
```

The player volume persists and continues working. No need to redeploy player files.
