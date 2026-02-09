# Changelog

All notable changes to the PWA-XLR player will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-30

### Added
- Initial implementation of PWA-XLR player
- Integration with Xibo Layout Renderer (XLR) v1.0.21
- XlrFileAdapter for Cache API → Blob URL conversion
- ScheduleBridge for schedule.js → XLR format conversion
- Main player orchestrator with collection cycle
- TypeScript type definitions for core modules
- Full XLR event handling (layoutChange, layoutEnd, errors)
- Vite build configuration with code splitting
- Service worker from core PWA
- Comprehensive README and development guide
- Ansible deployment playbook

### Features
- ✅ Production-tested layout rendering via XLR
- ✅ Complete transition support (fadeIn, fadeOut, flyIn, flyOut, etc.)
- ✅ Professional media playback with Video.js
- ✅ All Xibo widgets supported
- ✅ Schedule management from @core/schedule.js
- ✅ Offline-first caching with Cache API
- ✅ XMDS protocol support from @core/xmds.js
- ✅ Configuration management from @core/config.js
- ✅ 15-minute collection cycle

### Technical Details
- Bundle size: ~900 KB total (~290 KB gzipped)
- TypeScript for type safety
- ES modules with Vite bundler
- Reuses core infrastructure (cache, xmds, schedule, config)
- ~350 lines of custom integration code

### Differences from Core PWA
- ➕ Full transition support (XLR built-in)
- ➕ Complete widget support (all Xibo widgets)
- ➕ Professional media player (Video.js)
- ➕ Upstream bug fixes (XLR maintained by Xibo)
- ➖ Larger bundle size (~290 KB vs ~30 KB)
- ➖ Slightly slower startup (~2-3s vs ~1s)

### Deployment
- Ansible playbook: `playbooks/services/deploy-pwa-xlr.yml`
- Nginx location: `/player-xlr/`
- Podman volume: `xibo-player-xlr-storage`

---

## Future Versions

### Planned for 1.1.0
- [ ] Statistics reporting to CMS
- [ ] Better error recovery
- [ ] Offline mode indicator
- [ ] Screenshot capability
- [ ] Remote debugging interface

### Planned for 1.2.0
- [ ] XLR plugin system integration
- [ ] Advanced caching strategies
- [ ] Service worker optimization
- [ ] Custom widget development support

---

[1.0.0]: https://github.com/tecman/xibo_players/releases/tag/pwa-xlr-v1.0.0
