# PWA Player Deployment Guide

## Architecture

```
User Browser
    ↓ HTTPS
https://your-cms.example.com/pwa/
    ↓
Reverse Proxy (SWAG/nginx, Port 443)
    ↓
Xibo CMS container
    ↓
web/chromeos/ → PWA Player Files (HTML/JS/CSS)
```

**Same origin = No CORS issues.**

The PWA player must be served from the same domain as the CMS. All API calls
(REST `/pwa/*`, SOAP `/xmds.php`, file downloads) target the CMS origin.
Browsers block cross-origin requests, so the player cannot run from a
different host or `localhost`.

## Build

```bash
pnpm install              # From monorepo root
cd platforms/pwa
pnpm run build            # Production bundle → dist/
```

## Deploy to CMS

### Option 1: Ansible (recommended)

```bash
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa.yml \
  -e target_host=your-cms-host.example.com
```

### Option 2: Manual copy

Copy `platforms/pwa/dist/*` into the CMS container's `web/chromeos/` directory.
The CMS `.htaccess` rewrites `/pwa/*` → `web/chromeos/*`.

```bash
# Example with podman
podman cp platforms/pwa/dist/. xibo-cms-web:/var/www/cms/web/chromeos/
```

### Option 3: Custom CMS Docker image

The custom CMS image at `ghcr.io/linuxnow/xibo-cms` can embed the PWA
files during the Docker build, so no separate deployment step is needed.

## Verify

1. Open `https://your-cms.example.com/pwa/`
2. Setup page should appear on first visit
3. Enter CMS address (same domain), CMS key, display name
4. Player connects and starts showing layouts

## Alternative: Electron (for kiosk/desktop)

For local or kiosk deployments where same-origin hosting isn't available,
use the Electron wrapper. It injects CORS headers at the Chromium session
level, allowing the PWA to connect to any remote CMS.

```bash
cd platforms/electron-pwa
npx electron . --dev --no-kiosk
```

## Development

`pnpm run dev` starts a Vite dev server on `localhost:5174`. This is only
useful for UI development or testing with Electron. The dev server cannot
connect to a remote CMS due to CORS — use Electron or deploy to the CMS
for end-to-end testing.

## File Locations

| Environment | Path |
|-------------|------|
| Source | `platforms/pwa/src/` |
| Build output | `platforms/pwa/dist/` |
| CMS container | `/var/www/cms/web/chromeos/` |
| Podman volume | `~/.local/share/containers/storage/volumes/xibo-player-storage/_data/pwa/` |
| URL | `https://your-cms.example.com/pwa/` |
