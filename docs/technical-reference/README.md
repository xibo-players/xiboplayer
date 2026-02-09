# Technical Reference

**Need architectural details?** Deep technical documentation about system design, performance, and implementation.

## 📚 Available References

### [Performance Testing Guide](PERFORMANCE_TESTING.md)
Comprehensive procedures for testing player performance, benchmarking, and optimization validation.

**Topics**:
- Benchmarking procedures
- Memory profiling
- Network analysis
- Performance metrics
- Regression testing

## 🏗️ Architecture Documentation

### Core Architecture
See: [packages/core/docs/ARCHITECTURE.md](../../packages/core/docs/ARCHITECTURE.md)

**Topics**:
- Player lifecycle
- Module orchestration
- Event system
- Dependency injection
- State management

### Rendering Engine
See: [packages/renderer/docs/](../../packages/renderer/docs/)

**Topics**:
- Layout parsing (XLF format)
- Widget rendering
- Element reuse pattern
- Transition system
- Performance optimizations

### Cache & Offline
See: [packages/cache/docs/](../../packages/cache/docs/)

**Topics**:
- Cache architecture
- Download manager (parallel chunks)
- Cache proxy pattern
- Service Worker integration
- Storage strategies

### Scheduling
See: [packages/schedule/docs/](../../packages/schedule/docs/)

**Topics**:
- Campaign priority system
- Dayparting logic
- Interrupt handling
- Default fallback
- Geo-scheduling

### Service Worker
See: [packages/sw/docs/](../../packages/sw/docs/)

**Topics**:
- Chunk streaming
- Cache-first strategy
- Background sync
- Update mechanism
- Offline support

## 📊 Performance Optimizations

### Key Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Layout load | 17-20s | 3-5s | **4-6x faster** |
| 1GB download | 5 min | 1-2 min | **2-3x faster** |
| Widget fetch (10) | 10s | <1s | **10x faster** |
| Memory growth | +200MB/cycle | Stable | **50% reduction** |

### Optimization Strategies

1. **Parallel Downloads** - 4 concurrent chunk downloads
2. **Parallel Widget Fetching** - Promise.all() batch operations
3. **Element Reuse** - DOM manipulation minimization
4. **Blob URL Lifecycle** - Memory leak prevention

**Details**: See renderer and cache package documentation

## 🔌 API References

### XMDS (XML-based Media Distribution Service)
See: [packages/xmds/docs/](../../packages/xmds/docs/)

**SOAP Methods**:
- `RegisterDisplay` - Display registration
- `RequiredFiles` - Content sync
- `GetFile` - Media download
- `SubmitStats` - Proof of play
- `SubmitLog` - Error reporting

### XMR (Xibo Message Relay)
See: [packages/xmr/docs/](../../packages/xmr/docs/)

**WebSocket Protocol**:
- Connection lifecycle
- Message format
- Command types
- Reconnection logic

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration
```

### E2E Tests
```bash
# PWA E2E
cd platforms/pwa
npm run test:e2e
```

See: [Testing Guide](../developer-guides/TESTING.md)

## 📏 Code Metrics

### Package Sizes

| Package | Size (minified) | Gzipped |
|---------|-----------------|---------|
| @xiboplayer/core | ~45KB | ~12KB |
| @xiboplayer/renderer | ~38KB | ~10KB |
| @xiboplayer/cache | ~32KB | ~8KB |
| @xiboplayer/schedule | ~28KB | ~7KB |
| @xiboplayer/sw | ~15KB | ~4KB |

### Complexity

- **Cyclomatic Complexity**: Target <10 per function
- **Test Coverage**: Target >80%
- **Bundle Size**: PWA <500KB (minified + gzipped)

## 🔐 Security

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
media-src 'self' blob: https:;
connect-src 'self' https://your-cms.com wss://your-xmr.com;
```

### Authentication

- **CMS**: API key-based authentication
- **Display**: Hardware key + display ID
- **XMR**: Token-based WebSocket auth

### Data Storage

- **IndexedDB**: Media files (encrypted optional)
- **LocalStorage**: Configuration (non-sensitive)
- **Service Worker Cache**: HTTP responses

## 🌐 Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Full support |
| Firefox | 88+ | ✅ Full support |
| Edge | 90+ | ✅ Full support |
| Safari | 14+ | ⚠️ Limited (no Service Worker on iOS) |

### Required APIs

- IndexedDB v3
- Service Workers
- ES2020 (async/await, optional chaining)
- WebAssembly (for PDF rendering)

## 📊 Performance Benchmarks

### Typical Workload

- **Layout**: 1920x1080, 5 regions
- **Content**: 3 videos (50MB each), 5 images (2MB each), 2 web pages
- **Schedule**: 10 layouts, 8-hour daypart

### Expected Performance

- **Initial Load**: <5s
- **Layout Switch**: <1s
- **Memory**: <300MB stable
- **Network**: <100MB/hour (after initial sync)

## 🗂️ File Formats

### Supported Media

| Type | Formats | Notes |
|------|---------|-------|
| Video | MP4 (H.264), WebM | Hardware decoding preferred |
| Image | JPEG, PNG, GIF, WebP | Max 8192x8192 |
| Document | PDF | Rendered via PDF.js |
| Web | HTML, iframes | Sandboxed |

### Layout Format

- **XLF**: XML Layout Format (Xibo native)
- **JSON**: Parsed internal representation

## 📚 Related Documentation

- **User Guides**: [Operating the player](../user-guides/)
- **Developer Guides**: [Contributing](../developer-guides/)
- **Package Docs**: [NPM packages](../../packages/)

---

**Last Updated**: 2026-02-10
