# Xibo Players Documentation

Welcome to the Xibo Players documentation! This repository contains multi-platform Xibo-compatible digital signage players built as a modular NPM package ecosystem.

## 📚 Documentation by Audience

### 🚀 [Getting Started](getting-started/)
**New to Xibo Players?** Start here!
- Installation guides
- Quick start tutorials
- Basic configuration

### 👥 [User Guides](user-guides/)
**Operating the player?** Find user-focused documentation:
- [Offline Kiosk Mode](user-guides/OFFLINE_KIOSK_MODE.md)
- Campaign and scheduling guides
- Troubleshooting common issues

### 🔧 [Technical Reference](technical-reference/)
**Need architectural details?** Technical deep-dives:
- [Performance Testing](technical-reference/PERFORMANCE_TESTING.md)
- System architecture
- API references

### 💻 [Developer Guides](developer-guides/)
**Contributing to the project?** Development documentation:
- [Testing Guide](developer-guides/TESTING.md)
- [Release Process](developer-guides/RELEASE.md)
- [Build Instructions](developer-guides/BUILD.md)
- [Deployment Guide](developer-guides/DEPLOYMENT.md)

## 📦 Package-Specific Documentation

Each package has its own technical documentation:

- [`packages/core/docs/`](../packages/core/docs/) - Player core architecture
- [`packages/renderer/docs/`](../packages/renderer/docs/) - Rendering engine details
- [`packages/cache/docs/`](../packages/cache/docs/) - Cache and download management
- [`packages/schedule/docs/`](../packages/schedule/docs/) - Scheduling and campaigns
- [`packages/sw/docs/`](../packages/sw/docs/) - Service Worker implementation
- [`packages/xmds/docs/`](../packages/xmds/docs/) - XMDS SOAP client
- [`packages/xmr/docs/`](../packages/xmr/docs/) - XMR WebSocket wrapper
- [`packages/utils/docs/`](../packages/utils/docs/) - Shared utilities

## 🎯 Quick Links

| I want to... | Go to... |
|--------------|----------|
| Install the player | [Getting Started](getting-started/) |
| Run the player offline | [Offline Kiosk Mode](user-guides/OFFLINE_KIOSK_MODE.md) |
| Understand the architecture | [packages/core/docs/](../packages/core/docs/) |
| Run tests | [Testing Guide](developer-guides/TESTING.md) |
| Build for production | [Build Instructions](developer-guides/BUILD.md) |
| Publish a release | [Release Process](developer-guides/RELEASE.md) |

## 🏗️ Project Structure

```
xibo-players/
├── packages/              # NPM packages (@xiboplayer/*)
│   ├── core/             # Player orchestration
│   ├── renderer/         # Layout rendering
│   ├── cache/            # Offline caching
│   ├── schedule/         # Campaign scheduling
│   └── ...
├── platforms/            # Platform-specific implementations
│   ├── pwa/              # Progressive Web App
│   ├── electron/         # Desktop application
│   ├── android/          # Android app
│   └── ...
└── docs/                 # This documentation
```

## 📖 Documentation Standards

- **User Guides**: Step-by-step instructions for end users
- **Technical Reference**: Architecture, design decisions, performance analysis
- **Developer Guides**: How to contribute, test, build, and release
- **Package Docs**: API documentation and implementation details for specific packages

## 🗄️ Archive

Historical session notes and development logs are archived in [`archive/2026-02-sessions/`](archive/2026-02-sessions/).

## 🆘 Getting Help

- **Issues**: https://github.com/xibo/xibo-players/issues
- **Discussions**: https://github.com/xibo/xibo-players/discussions
- **Xibo Community**: https://community.xibo.org.uk/

## 📝 Contributing to Documentation

Found a typo or want to improve the docs? See the [Contributing Guide](developer-guides/TESTING.md#documentation) for guidelines.

---

**Last Updated**: 2026-02-10
