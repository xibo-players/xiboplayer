# Unified PWA Deployment Guide

Deploy both Core PWA and PWA-XLR in a single shared volume with smart routing.

## Benefits of Unified Deployment

### ✅ Resource Efficiency
- **Single volume** instead of two separate volumes
- **Shared infrastructure** (service worker, cache)
- **Smaller total footprint** (shared dependencies)

### ✅ Flexibility
- **Smart routing** based on device capabilities
- **User choice** via URL parameter
- **Easy comparison** - switch variants without reconfiguration
- **Gradual migration** - test XLR on subset of displays

### ✅ Simplified Management
- **One deployment** updates both variants
- **Consistent configuration** across variants
- **Single nginx location** for both

## Directory Structure

```
/var/lib/containers/storage/volumes/xibo-player-storage/_data/
├── index.html              # Smart router (chooses variant)
├── core/                   # Core PWA (~30 KB gzipped)
│   ├── index.html
│   ├── sw.js
│   └── assets/
└── xlr/                    # PWA-XLR (~290 KB gzipped)
    ├── index.html
    ├── sw.js
    └── assets/
```

## Smart Routing Logic

The router (`index.html`) chooses the best variant:

### 1. Explicit Selection (URL parameter)
```
http://host/player/?variant=core     → Core PWA
http://host/player/?variant=xlr      → PWA-XLR
```

**Use case:** User preference or testing

### 2. Stored Preference (localStorage)
If user previously chose a variant, use that.

**Use case:** Remember user choice across sessions

### 3. Device Capabilities Detection
```javascript
// Limited device → Core PWA
- Very old Android (< 5.0)
- Very old iOS (< 11)
- Low memory (< 2 GB)
- Legacy browsers

// Modern device → PWA-XLR (default)
- Better features
- Professional transitions
- Complete widget support
```

### 4. Default
If no other criteria match: **PWA-XLR** (best features)

## Deployment

### Prerequisites

Build both variants:

```bash
# Build Core PWA
cd ~/Devel/tecman/xibo_players/packages/core
npm run build

# Build PWA-XLR
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm run build
```

### Deploy with Ansible

```bash
cd ~/Devel/tecman/tecman_ansible

ansible-playbook playbooks/services/deploy-player-unified.yml \
  -e target_host=h1.superpantalles.com
```

### Manual Deployment

```bash
# Get volume mount point
VOLUME_PATH=$(podman volume inspect xibo-player-storage | jq -r '.[0].Mountpoint')

# Create structure
sudo mkdir -p "$VOLUME_PATH"/{core,xlr}

# Copy Core PWA
sudo rsync -av ~/Devel/tecman/xibo_players/packages/core/dist/ "$VOLUME_PATH/core/"

# Copy PWA-XLR
sudo rsync -av ~/Devel/tecman/xibo_players/platforms/pwa-xlr/dist/ "$VOLUME_PATH/xlr/"

# Copy smart router
sudo cp ~/Devel/tecman/xibo_players/player-router.html "$VOLUME_PATH/index.html"

# Fix permissions
sudo chown -R $UID:$UID "$VOLUME_PATH"
```

## Nginx Configuration

### Option 1: Smart Router (Recommended)

```nginx
location /player/ {
    alias /var/lib/containers/storage/volumes/xibo-player-storage/_data/;
    try_files $uri $uri/ /player/index.html;

    # CORS headers
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';

    # Cache control
    add_header Cache-Control "public, max-age=3600" always;
}
```

**Usage:**
```
http://host/player/                    → Smart router (auto-selects)
http://host/player/?variant=core       → Force Core PWA
http://host/player/?variant=xlr        → Force PWA-XLR
```

### Option 2: Direct Access to Variants

```nginx
# Smart router
location = /player {
    return 301 /player/;
}

location /player/ {
    alias /var/lib/containers/storage/volumes/xibo-player-storage/_data/;
    try_files $uri $uri/ /player/index.html;
}

# Direct access to Core PWA
location /player/core/ {
    alias /var/lib/containers/storage/volumes/xibo-player-storage/_data/core/;
    try_files $uri $uri/ /player/core/index.html;
}

# Direct access to PWA-XLR
location /player/xlr/ {
    alias /var/lib/containers/storage/volumes/xibo-player-storage/_data/xlr/;
    try_files $uri $uri/ /player/xlr/index.html;
}
```

**Usage:**
```
http://host/player/              → Smart router
http://host/player/core/         → Core PWA directly
http://host/player/xlr/          → PWA-XLR directly
```

### Option 3: User-Agent Based Routing (Nginx)

```nginx
location /player/ {
    set $variant "xlr";

    # Detect limited devices
    if ($http_user_agent ~* "Android [2-4]\.") {
        set $variant "core";
    }
    if ($http_user_agent ~* "iPhone OS [5-9]_") {
        set $variant "core";
    }

    alias /var/lib/containers/storage/volumes/xibo-player-storage/_data/$variant/;
    try_files $uri $uri/ /player/$variant/index.html;
}
```

## Usage Examples

### End Users

**Default (best features):**
```
http://h1.superpantalles.com/player/?cmsAddress=http://cms&cmsKey=KEY&hardwareKey=HW
```
→ Automatically selects PWA-XLR

**Legacy device:**
```
http://h1.superpantalles.com/player/?variant=core&cmsAddress=...
```
→ Uses Core PWA (smaller, faster)

**Testing transitions:**
```
http://h1.superpantalles.com/player/?variant=xlr&cmsAddress=...
```
→ Uses PWA-XLR (transitions supported)

### Developers

**Compare variants side-by-side:**

Open two browser windows:
```
Window 1: http://host/player/core/?cmsAddress=...
Window 2: http://host/player/xlr/?cmsAddress=...
```

Use same credentials, compare:
- Rendering quality
- Transitions
- Bundle size (Network tab)
- Memory usage (Performance tab)
- Feature support

**Test smart router:**
```
http://host/player/?cmsAddress=...

Then check console:
[Player Router] Redirecting to: xlr http://host/player/xlr/?cmsAddress=...
```

## Migration Strategy

### Phase 1: Parallel Deployment
- Deploy unified structure
- Both variants available
- Smart router defaults to XLR
- Users can opt-in to Core if needed

### Phase 2: Testing (1-2 weeks)
- Monitor both variants
- Collect feedback
- Identify any XLR issues
- Fine-tune device detection

### Phase 3: Evaluation
Compare metrics:
- Performance
- Feature usage
- Error rates
- User satisfaction

### Phase 4: Decision
Based on testing:

**Option A:** XLR becomes default
- Update docs
- Keep Core as fallback
- Remove Core after 3 months

**Option B:** Keep both indefinitely
- Core for legacy/limited devices
- XLR for modern displays
- Smart router handles selection

**Option C:** Core remains default
- If XLR has issues
- XLR available for specific use cases
- Revisit decision later

## Resource Usage Comparison

### Storage

**Separate Deployments:**
```
Core PWA:    ~100 KB (gzipped)
PWA-XLR:     ~290 KB (gzipped)
Total:       ~390 KB
```

**Unified Deployment:**
```
Core PWA:    ~100 KB (gzipped)
PWA-XLR:     ~290 KB (gzipped)
Router:      ~2 KB (gzipped)
Shared:      0 KB (service workers separate)
Total:       ~392 KB
```

**Savings:** Minimal overhead (~2 KB for router)

### Runtime

**Memory per player instance:**
- Core PWA: ~20-30 MB
- PWA-XLR: ~50-70 MB

**Network:**
- Initial load: Depends on variant chosen
- Updates: Only changed variant needs redownload

## Maintenance

### Updating Players

Update both variants in one deployment:

```bash
# Build both
cd ~/Devel/tecman/xibo_players
npm run build:core    # If you add this script
npm run build:xlr     # If you add this script

# Deploy
cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-player-unified.yml
```

### Updating Only One Variant

```bash
# Update just Core PWA
cd ~/Devel/tecman/xibo_players/packages/core
npm run build

VOLUME_PATH=$(ssh user@host 'podman volume inspect xibo-player-storage | jq -r ".[0].Mountpoint"')
rsync -av dist/ user@host:$VOLUME_PATH/core/

# Or update just PWA-XLR
cd ~/Devel/tecman/xibo_players/platforms/pwa-xlr
npm run build
rsync -av dist/ user@host:$VOLUME_PATH/xlr/
```

### Monitoring

Check which variant displays are using:

```javascript
// Add to player initialization
console.log('[Player] Variant:', window.location.pathname.includes('/xlr/') ? 'XLR' : 'Core');

// Or report to analytics
if (window.location.pathname.includes('/xlr/')) {
  // Track XLR usage
}
```

## Advanced Configuration

### Percentage-Based Rollout

Deploy XLR to only 20% of displays:

```javascript
// In router
function getPlayerVariant() {
  // ... existing logic ...

  // 20% XLR rollout
  const rolloutPercent = 20;
  const displayHash = hashCode(localStorage.getItem('hardwareKey') || '');
  if ((displayHash % 100) < rolloutPercent) {
    return 'xlr';
  }

  return 'core';
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

### Feature Flags

Enable XLR only for displays with specific tags:

```javascript
// In router
async function getPlayerVariant() {
  const config = JSON.parse(localStorage.getItem('config') || '{}');

  // Check display tags (would need to be stored during registration)
  if (config.tags && config.tags.includes('xlr-enabled')) {
    return 'xlr';
  }

  return 'core';
}
```

### A/B Testing

Track performance metrics:

```javascript
// In player initialization
const variant = window.location.pathname.includes('/xlr/') ? 'xlr' : 'core';
const startTime = Date.now();

window.addEventListener('load', () => {
  const loadTime = Date.now() - startTime;

  // Send to analytics
  analytics.track('player_load', {
    variant,
    loadTime,
    userAgent: navigator.userAgent,
    memory: navigator.deviceMemory,
  });
});
```

## Troubleshooting

### Router not working

**Symptom:** Stays on router page, doesn't redirect

**Check:**
1. Browser console for errors
2. JavaScript enabled
3. localStorage access allowed

**Fix:**
```javascript
// Add fallback in router
setTimeout(() => {
  if (window.location.pathname === '/player/') {
    // Force redirect if stuck
    window.location.href = '/player/xlr/';
  }
}, 3000);
```

### Wrong variant loading

**Symptom:** Expected Core, got XLR (or vice versa)

**Check:**
```javascript
// In browser console
console.log('Variant param:', new URLSearchParams(location.search).get('variant'));
console.log('Stored pref:', localStorage.getItem('player_variant'));
console.log('Device memory:', navigator.deviceMemory);
```

**Fix:** Clear localStorage or add explicit `?variant=` parameter

### Both variants not updating

**Symptom:** Deployment completes but old code loads

**Cause:** Browser cache or service worker

**Fix:**
```bash
# Bust cache by updating service worker version
# Or clear browser cache
# Or use Ctrl+Shift+R (hard refresh)
```

## Best Practices

### 1. Always Deploy Both Variants
Even if you primarily use one, keep both available for flexibility.

### 2. Test Router Locally
```bash
cd ~/Devel/tecman/xibo_players
python3 -m http.server 8000

# Open http://localhost:8000/player-router.html
```

### 3. Monitor Variant Usage
Track which displays use which variant for capacity planning.

### 4. Version Both Variants
Keep version numbers in sync or maintain separate versioning.

### 5. Document Device Requirements
Clearly communicate when to use each variant.

## Summary

**Unified deployment provides:**
- ✅ Flexibility (choose best variant per device)
- ✅ Efficiency (single volume)
- ✅ Easy comparison (side-by-side testing)
- ✅ Gradual migration (test before committing)
- ✅ Simplified management (one deployment)

**Recommendation:** Use unified deployment with smart router for production.

---

**Last Updated:** 2026-01-30
**Status:** Production Ready
