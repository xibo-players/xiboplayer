# Quick Start Guide

Get the PWA player running in 5 minutes.

## Prerequisites

- Node.js 22+ and pnpm
- Access to a Xibo CMS instance
- CMS secret key (from CMS Settings → Display Settings)

## Important: Same-Origin Requirement

The PWA player **must** be served from the same domain as the Xibo CMS.
All API calls (REST, SOAP, file downloads) go to the CMS origin, and
browsers block cross-origin requests.

For local/kiosk use, use the **Electron wrapper** which handles CORS
at the Chromium session level.

## Build

```bash
pnpm install              # From monorepo root
cd platforms/pwa
pnpm run build            # Production bundle → dist/
```

## Deploy to CMS

```bash
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa.yml \
  -e target_host=your-cms-host.example.com
```

Or copy `platforms/pwa/dist/*` to the CMS `web/chromeos/` directory manually.

## Access Player

Open: `https://your-cms.example.com/pwa/`

Configure with:
- **CMS Address:** `https://your-cms.example.com` (same domain)
- **CMS Key:** Your CMS key
- **Display Name:** Your display name

## Authorize in CMS

1. Open your CMS admin UI
2. Go to Displays
3. Find your display (status: Waiting)
4. Authorize it
5. Refresh the player page

The player should start downloading files and displaying layouts.

## Alternative: Electron (for kiosk/desktop)

```bash
cd platforms/electron-pwa
pnpm install
npx electron . --dev --no-kiosk
```

Electron can connect to any remote CMS — no same-origin restriction.

## Troubleshooting

### "Connection failed: NetworkError"
- Verify the CMS address matches the domain the player is served from
- Check browser console for CORS errors (means player is not same-origin)
- Use Electron for cross-origin setups

### "Display not authorized"
- Go to CMS → Displays → Authorize your display
- Refresh the player page

### Layouts don't show
- Check browser console for download errors
- Verify schedule has active layouts assigned to the display

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide
- See `platforms/electron-pwa/README.md` for Electron/kiosk setup
