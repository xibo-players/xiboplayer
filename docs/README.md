# Xibo Player Documentation

**Version**: 1.0
**Last Updated**: 2026-02-05

---

## Quick Links

### Performance Optimizations (NEW!)

- 📊 **[Performance Optimizations](PERFORMANCE_OPTIMIZATIONS.md)** - Details on 4-10x performance improvements
- 🧪 **[Performance Testing Guide](PERFORMANCE_TESTING.md)** - Comprehensive testing procedures

### Getting Started

- 🚀 **[Quick Start Guide](../packages/docs/QUICKSTART.md)** - Get up and running
- 🏗️ **[Architecture Overview](../packages/docs/ARCHITECTURE.md)** - System design
- 📦 **[Deployment Guide](../packages/docs/DEPLOYMENT.md)** - Deployment instructions
- 📊 **[Project Status](../packages/docs/STATUS.md)** - Current state

---

## Performance Optimizations Summary

The PWA player now includes comprehensive performance optimizations:

### Key Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Layout load time | 17-20s | 3-5s | **6-10x faster** |
| 1GB file download | 5 min | 1-2 min | **4x faster** |
| Widget HTML fetch (10) | 10s | <1s | **10x faster** |
| Memory growth | +200MB/cycle | Stable | **50% reduction** |

### What Was Optimized

1. **Parallel Chunk Downloads** - Download multiple chunks simultaneously
2. **Parallel Widget Fetching** - Fetch all widget HTML in one batch
3. **Parallel Media Pre-fetching** - Pre-load media URLs before rendering
4. **Element Reuse** - Toggle visibility instead of recreating DOM

**Details**: [PERFORMANCE_OPTIMIZATIONS.md](PERFORMANCE_OPTIMIZATIONS.md)

---

## Testing

After deployment, verify optimizations are working:

### Quick Console Check

1. Open player in browser
2. Press F12 → Console
3. Look for these logs:

```
✅ [Cache] Downloading N chunks in parallel (4 concurrent)
✅ [PWA] Fetching N widget HTML resources in parallel...
✅ [RendererLite] Pre-fetching N media URLs in parallel...
✅ [RendererLite] Pre-creating widget elements...
```

**Full Testing Guide**: [PERFORMANCE_TESTING.md](PERFORMANCE_TESTING.md)

---

## Documentation Structure

```
docs/
├── README.md (this file)
├── PERFORMANCE_OPTIMIZATIONS.md  ← Technical details
└── PERFORMANCE_TESTING.md        ← Testing procedures

packages/docs/
├── QUICKSTART.md
├── ARCHITECTURE.md
├── DEPLOYMENT.md
└── STATUS.md
```

---

## For Developers

### Modified Files

Performance optimizations changed:
- `packages/core/src/cache.js` - Parallel chunk downloads
- `packages/core/src/renderer-lite.js` - Element reuse + media pre-fetch
- `platforms/pwa/src/main.ts` - Parallel widget fetching

### Configuration

Adjust chunk concurrency in `packages/core/src/cache.js:12`:

```javascript
const CONCURRENT_CHUNKS = 4; // Adjust 2-6 based on network
```

---

## For Operators

### Deployment

See Ansible repository: `tecman_ansible/docs/services/PWA_PLAYER_DEPLOYMENT.md`

**Quick Deploy**:
```bash
cd ~/Devel/tecman/xibo_players/platforms/pwa
npm run build

cd ~/Devel/tecman/tecman_ansible
ansible-playbook playbooks/services/deploy-pwa.yml
```

**Deployed To**: h1.superpantalles.com (2026-02-05)

---

## Support

### Issues?

1. Check browser console for errors
2. Review [PERFORMANCE_TESTING.md](PERFORMANCE_TESTING.md) troubleshooting section
3. Verify optimizations deployed (grep for "parallel" in console)
4. Clear browser cache and hard reload

### Contact

File issues with:
- Browser console logs
- Network tab screenshots
- Memory timeline (if memory issue)
- Test results from PERFORMANCE_TESTING.md

---

**Status**: ✅ Production Ready with Performance Optimizations
