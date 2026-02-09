# PWA-XLR Quick Start Guide

## 🚀 Deploy in 5 Minutes

### Prerequisites

- Node.js 18+ installed
- Ansible installed (for deployment)
- Access to Xibo CMS
- Target host with Podman

### Step 1: Build

```bash
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm install
npm run build
```

**Expected output:**
```
✓ built in 3s
dist/index.html                     1.95 kB
dist/assets/xlr-*.js              868.50 kB
```

### Step 2: Deploy

```bash
cd ~/Devel/tecman/tecman_ansible

ansible-playbook playbooks/services/deploy-pwa-xlr.yml \
  -e target_host=h1.superpantalles.com
```

**Expected output:**
```
TASK [Display deployment summary]
ok: [h1.superpantalles.com] => {
    "msg": "🎉 Player available at: http://h1.superpantalles.com/player-xlr/"
}
```

### Step 3: Configure

Open in browser:
```
http://h1.superpantalles.com/player-xlr/?cmsAddress=http://your-cms&cmsKey=YOUR_KEY&hardwareKey=HW_KEY
```

**Replace:**
- `your-cms` - Your CMS URL (e.g., `cms.example.com`)
- `YOUR_KEY` - Your CMS key from Display Settings
- `HW_KEY` - Hardware key (UUID or custom)

### Step 4: Verify

Check browser console for:
```
[PWA-XLR] Initializing player...
[PWA-XLR] Core modules loaded
[PWA-XLR] XLR initialized
[PWA-XLR] Starting collection cycle...
[PWA-XLR] Display registered
[PWA-XLR] Updating XLR with new layouts: 3
[XLR] Layout changed: 123
```

If you see these logs, player is working! ✅

---

## 📋 Common Issues

### Build fails

**Error:** `Cannot find module '@xibosignage/xibo-layout-renderer'`

**Fix:**
```bash
npm install
```

### Type check fails

**Error:** `TS2345: Argument of type...`

**Fix:**
```bash
# Ensure you're on latest code
git pull
npm install
npm run type-check
```

### Deployment fails

**Error:** `Verify PWA-XLR build exists - FAILED`

**Fix:**
```bash
# Build first!
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm run build

# Then deploy
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa-xlr.yml
```

### Player won't connect

**Error:** CORS errors in console

**Fix:** Check Nginx configuration includes:
```nginx
location /player-xlr/ {
    alias /var/www/html/player-xlr/;
    add_header Access-Control-Allow-Origin *;
}
```

### No layouts showing

**Check:**
1. Browser console for errors
2. CMS has layouts scheduled
3. Display is authorized in CMS
4. Files downloaded: Open DevTools → Application → Cache Storage

---

## 🧪 Testing

### Test Transitions

1. Create campaign with 2+ layouts
2. Add transitions in CMS (fadeIn, flyOut, etc.)
3. Assign to display
4. Watch transitions in player

### Test Media

1. Add layout with image widget
2. Add layout with video widget
3. Verify both play correctly

### Test Schedule

1. Create daypart schedule
2. Verify correct layouts show at correct times
3. Check priority resolution works

---

## 📊 Monitoring

### Check Player Status

Open browser DevTools:

```javascript
// Check cache
caches.keys().then(console.log);

// Check stored config
console.log(localStorage);

// Check if XLR is loaded
console.log(window.xlr); // If exposed
```

### Check Logs

All logs prefixed with:
- `[PWA-XLR]` - Main player
- `[XLR-Adapter]` - File adapter
- `[ScheduleBridge]` - Schedule conversion
- `[XLR]` - XLR library

### Check Collection Cycle

Runs every 15 minutes. Force immediately:
```javascript
// In browser console (if exposed)
player.collect();
```

---

## 🔄 Updating

### Update Player Code

```bash
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
git pull
npm install
npm run build
```

### Redeploy

```bash
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa-xlr.yml
```

### Update XLR Library

```bash
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm update @xibosignage/xibo-layout-renderer
npm run build
```

---

## 🆚 Core PWA vs PWA-XLR

| What You Need | Use This |
|---------------|----------|
| Basic layouts, small bundle | Core PWA (`/player/`) |
| Transitions between layouts | **PWA-XLR** (`/player-xlr/`) |
| All Xibo widgets | **PWA-XLR** |
| Professional video playback | **PWA-XLR** |
| Fastest startup time | Core PWA |
| Smallest bundle size | Core PWA |
| Less maintenance | **PWA-XLR** |

**Recommendation:** Use PWA-XLR for production, Core PWA for testing.

---

## 📖 Full Documentation

- **README.md** - Complete documentation
- **DEVELOPMENT.md** - Developer guide
- **CHANGELOG.md** - Version history
- **PWA_XLR_IMPLEMENTATION.md** - Implementation details

---

## 🆘 Support

### Issues

1. Check browser console for errors
2. Check README troubleshooting section
3. Check DEVELOPMENT.md for debugging tips
4. Report issues on GitHub

### Logs

Increase verbosity:
```javascript
localStorage.setItem('debug', 'xlr:*');
```

### Reset Player

Clear all data:
```javascript
// In browser console
localStorage.clear();
caches.keys().then(keys => {
  keys.forEach(k => caches.delete(k));
});
location.reload();
```

---

**Quick Reference:**

```bash
# Build
npm run build

# Deploy
ansible-playbook playbooks/services/deploy-pwa-xlr.yml

# Access
http://host/player-xlr/?cmsAddress=...&cmsKey=...&hardwareKey=...
```

**Done!** 🎉
