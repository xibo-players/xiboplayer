# Quick Start Guide

Get the PWA player running in 5 minutes.

## Prerequisites

- Node.js 18+ and npm
- Access to a Xibo CMS instance
- CMS secret key (from CMS Settings → Display Settings)

## Local Testing (With CORS Proxy)

### 1. Install Dependencies

```bash
cd ~/Devel/tecman/xibo_players/core
npm install
```

### 2. Start CORS Proxy

```bash
# Terminal 1
CMS_URL=https://displays.superpantalles.com npm run proxy
```

You should see:
```
[Proxy] Running on http://localhost:8080
[Proxy] Forwarding to https://displays.superpantalles.com
```

### 3. Start Dev Server

```bash
# Terminal 2
npm run dev
```

You should see:
```
VITE v5.4.11  ready in 123 ms

➜  Local:   http://localhost:5173/player/
➜  Network: use --host to expose
```

### 4. Configure Player

1. Open http://localhost:5173/player/
2. You'll be redirected to setup page
3. Enter:
   - **CMS Address:** `http://localhost:8080` (the proxy!)
   - **CMS Key:** Your actual CMS secret key
   - **Display Name:** Test Display
4. Click **Connect**

### 5. Authorize in CMS

1. Open your CMS admin UI: https://displays.superpantalles.com
2. Go to Displays
3. Find "Test Display" (status: Waiting)
4. Click → Authorize
5. Refresh the player setup page

### 6. Watch It Work

The player should:
- Redirect to main player page
- Show "Collection cycle starting..." in console
- Download required files
- Display layouts

**Check browser console (F12)** for detailed logs.

## Production Deployment

### 1. Build PWA

```bash
cd ~/Devel/tecman/xibo_players/core
npm run build
```

### 2. Deploy Xibo with Player Volume

```bash
cd ~/Devel/tecman/tecman_ansible

ansible-playbook playbooks/services/install.yml \
  -e service=xibo \
  --become \
  --become-user=pau
```

### 3. Deploy Player Files

```bash
ansible-playbook playbooks/services/deploy-player.yml \
  --become \
  --become-user=pau
```

### 4. Access Player

Open: `https://displays.superpantalles.com/player/`

Configure with:
- **CMS Address:** `https://displays.superpantalles.com` (same domain!)
- **CMS Key:** Your CMS key
- **Display Name:** Production Display

## Troubleshooting

### "Connection failed: NetworkError"

**During proxy testing:**
- Make sure proxy is running on port 8080
- Use `http://localhost:8080` as CMS address (not the real CMS URL)

**During production:**
- Use `https://displays.superpantalles.com` as CMS address
- Check browser console for actual error
- Verify SWAG is running and proxying to Xibo

### "Display not authorized"

- Go to CMS → Displays
- Find your display name
- Click Authorize
- Refresh player page

### Layouts don't show

- Check browser console for download errors
- Verify files downloaded (check IndexedDB in browser dev tools)
- Check layout translation succeeded (console logs)
- Verify schedule has active layouts (time range)

### Service Worker not working

- Check Application tab in browser dev tools
- Verify service worker registered
- Try hard refresh (Ctrl+Shift+R)
- Clear cache and reload

## Next Steps

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
- See [free-player-development-reference.md](./free-player-development-reference.md) for XMDS protocol reference

## Getting Help

- Check browser console for errors
- Check Xibo CMS logs
- Check SWAG nginx logs
- Open an issue on GitHub
