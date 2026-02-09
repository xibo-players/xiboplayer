# Developer Guides

**Contributing to Xibo Players?** Everything you need to develop, test, build, and release.

## 📚 Available Guides

### [Testing Guide](TESTING.md)
Comprehensive testing documentation covering unit, integration, and E2E tests.

**Topics**:
- Running tests
- Writing new tests
- Test coverage
- CI/CD integration

### [Release Process](RELEASE.md)
Step-by-step guide for publishing new releases.

**Topics**:
- Version management
- Changelog generation
- NPM publishing
- Platform packaging

### [Build Instructions](BUILD.md)
Building the player for all platforms.

**Topics**:
- Development builds
- Production builds
- Platform-specific builds
- Build optimization

### [Deployment Guide](DEPLOYMENT.md)
Deploying the player to production environments.

**Topics**:
- PWA deployment
- Electron packaging
- Android APK
- Chrome extension

## 🛠️ Development Setup

### Prerequisites

```bash
# Install Node.js 18+
node --version  # Should be v18.0.0 or later

# Install dependencies
git clone https://github.com/xibo/xibo-players.git
cd xibo-players
npm install
```

### Development Workflow

1. **Create a branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - Edit code in `packages/*/src/`
   - Add tests in `packages/*/src/*.test.js`

3. **Run tests**
   ```bash
   npm test
   ```

4. **Build and test locally**
   ```bash
   cd platforms/pwa
   npm run dev
   ```

5. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

## 📦 Package Development

### Monorepo Structure

```
xibo-players/
├── packages/              # Published NPM packages
│   ├── core/             # @xiboplayer/core
│   ├── renderer/         # @xiboplayer/renderer
│   ├── cache/            # @xiboplayer/cache
│   └── ...
├── platforms/            # Platform implementations
│   ├── pwa/              # Uses packages via npm/workspace
│   ├── electron/
│   └── ...
└── package.json          # Workspace root
```

### Working on Packages

```bash
# Run tests for specific package
npm test -w packages/core

# Build specific package
npm run build -w packages/core

# Link package locally
cd packages/core
npm link

cd ../../platforms/pwa
npm link @xiboplayer/core
```

### Publishing Packages

See: [Release Process](RELEASE.md)

```bash
# Bump version
npm version patch -w packages/core

# Publish (requires npm login)
npm publish -w packages/core --access public
```

## 🧪 Testing

### Running Tests

```bash
# All packages
npm test

# Single package
npm test -w packages/renderer

# Watch mode
npm run test:watch -w packages/renderer

# Coverage
npm run test:coverage
```

### Writing Tests

**Example unit test**:
```javascript
// packages/renderer/src/layout.test.js
import { describe, it, expect } from 'vitest';
import { parseLayout } from './layout.js';

describe('parseLayout', () => {
  it('should parse XLF layout', () => {
    const xlf = '<layout width="1920" height="1080">...</layout>';
    const layout = parseLayout(xlf);

    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(1080);
  });
});
```

See: [Testing Guide](TESTING.md)

## 🏗️ Building

### Development Build

```bash
# PWA (hot reload)
cd platforms/pwa
npm run dev

# Electron (watch mode)
cd platforms/electron
npm run dev
```

### Production Build

```bash
# PWA
cd platforms/pwa
npm run build
# Output: dist/

# Electron
cd platforms/electron
npm run make
# Output: out/make/

# Android
cd platforms/android
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/
```

See: [Build Instructions](BUILD.md)

## 📋 Code Style

### Linting

```bash
# Run ESLint
npm run lint

# Fix automatically
npm run lint:fix
```

### Formatting

```bash
# Run Prettier
npm run format

# Check without fixing
npm run format:check
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new widget type
fix: resolve memory leak in renderer
docs: update API documentation
test: add cache proxy tests
chore: bump dependencies
```

## 🔄 CI/CD

### GitHub Actions

- **Test**: Runs on every PR
- **Build**: Runs on merge to main
- **Publish**: Runs on version tags

### Automated Checks

- ✅ Unit tests pass
- ✅ Linting passes
- ✅ Build succeeds
- ✅ Coverage >80%

## 📚 Documentation

### Writing Docs

- **User guides**: Step-by-step instructions
- **Technical reference**: Architecture, API docs
- **Package docs**: Implementation details in `packages/*/docs/`

### Documentation Structure

```
docs/
├── getting-started/      # Installation, quickstart
├── user-guides/          # Operating the player
├── technical-reference/  # Architecture, performance
└── developer-guides/     # This section
```

### Updating Docs

1. Edit markdown files in `docs/`
2. Update cross-references
3. Verify links work
4. Commit with `docs:` prefix

## 🐛 Debugging

### Browser DevTools

```
F12 → Console
- [Core] logs - Player lifecycle
- [Cache] logs - Download progress
- [Renderer] logs - Layout rendering
```

### VS Code Debugging

**.vscode/launch.json**:
```json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug PWA",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/platforms/pwa"
}
```

### Common Issues

**Tests failing**:
- Clear `node_modules` and reinstall
- Check Node.js version (18+)
- Run `npm run build` first

**Build errors**:
- Check TypeScript errors: `npm run type-check`
- Verify imports resolve correctly
- Clear build cache: `rm -rf dist/`

## 🤝 Contributing

### Before Submitting PR

1. ✅ Tests pass (`npm test`)
2. ✅ Linting passes (`npm run lint`)
3. ✅ Build succeeds (`npm run build`)
4. ✅ Documentation updated
5. ✅ Commit messages follow convention

### PR Review Process

1. **Automated checks** run on GitHub Actions
2. **Code review** by maintainers
3. **Testing** on target platforms
4. **Merge** to main branch

### Getting Help

- **Questions**: GitHub Discussions
- **Bugs**: GitHub Issues
- **Chat**: Community forums

## 📦 Release Checklist

See: [Release Process](RELEASE.md)

- [ ] All tests passing
- [ ] Version bumped
- [ ] Changelog updated
- [ ] Documentation current
- [ ] Build artifacts generated
- [ ] NPM packages published
- [ ] Git tag pushed
- [ ] Release notes created

## 🌟 Best Practices

### Code Quality

- Keep functions small (<50 lines)
- Add JSDoc comments for public APIs
- Write tests for new features
- Use TypeScript where helpful

### Performance

- Avoid unnecessary re-renders
- Use Web Workers for heavy computation
- Lazy load large dependencies
- Profile before optimizing

### Security

- Sanitize user input
- Use CSP headers
- Validate file types
- Avoid eval() and innerHTML

## 📚 Related Documentation

- **Getting Started**: [Quick setup](../getting-started/)
- **User Guides**: [Operating the player](../user-guides/)
- **Technical**: [Architecture details](../technical-reference/)
- **Package Docs**: [NPM packages](../../packages/)

## 🆘 Getting Help

- **Issues**: https://github.com/xibo/xibo-players/issues
- **Discussions**: https://github.com/xibo/xibo-players/discussions
- **Community**: https://community.xibo.org.uk/

---

**Last Updated**: 2026-02-10
