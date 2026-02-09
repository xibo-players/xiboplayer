# Release Process

How to create and publish official releases of the Xibo Player.

## Overview

Releases are created by tagging a git commit, which triggers automated GitHub Actions workflows to build all platforms and create a GitHub Release with downloadable artifacts.

## Prerequisites

- Write access to repository
- All tests passing
- Documentation updated
- CHANGELOG.md updated (optional)

## Release Checklist

Before creating a release:

- [ ] All features complete and tested
- [ ] Run `npm test` - all tests pass (especially license bypass)
- [ ] Build succeeds on all platforms locally
- [ ] PWA deployed and tested on production server
- [ ] Chrome extension tested in browser
- [ ] Electron tested on at least Linux
- [ ] No critical bugs in issue tracker
- [ ] Documentation up to date
- [ ] Breaking changes documented
- [ ] CHANGELOG.md updated (if using conventional-changelog)

## Version Numbers

We use [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., `1.0.0`)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards-compatible)
- **PATCH**: Bug fixes (backwards-compatible)

### Core Version (Source of Truth)

All versions derive from: `packages/core/package.json`

```json
{
  "version": "1.0.0"
}
```

### Platform Versions

Generated automatically by `npm run sync-version`:

| Platform | Format | Example |
|----------|--------|---------|
| Core PWA | `X.Y.Z` | `1.0.0` |
| Electron | `X.Y.Z-electron.BUILD` | `1.0.0-electron.392848` |
| Chrome | `X.Y.Z` | `1.0.0` |
| Android | `versionCode: XXYYZZ` | `10000` (from 1.0.0) |
| webOS | `X.Y.Z` | `1.0.0` |

Build numbers (e.g., `392848`) are last 6 digits of Unix timestamp.

## Creating a Release

### Step 1: Update Version

```bash
# Edit core version
vi packages/core/package.json
# Change: "version": "1.0.0" to "1.0.1"

# Sync all platform versions
npm run sync-version
```

**Output:**
```
📦 Version Synchronization

Core version: 1.0.1

Updating platform versions:
   ✓ electron: 1.0.0-electron.392848 → 1.0.1-electron.394721
   ✓ chrome: 1.0.0 → 1.0.1
   ✓ android: versionCode 10000, versionName "1.0.1"
   ✓ webos: 1.0.0 → 1.0.1

🔒 Validating license bypass...
   ✓ License bypass preserved in xmds.js

📝 Generating changelog...
   ✓ CHANGELOG.md updated

✅ Version synchronization complete
```

### Step 2: Review Changes

```bash
# View updated files
git diff

# Check which files changed
git status
```

Expected changes:
- `packages/core/package.json` - Core version
- `platforms/electron/package.json` - Electron version
- `platforms/chrome/manifest.json` - Chrome version
- `platforms/android/app/build.gradle` - Android version
- `platforms/webos/appinfo.json` - webOS version
- `CHANGELOG.md` - Changelog entries (if generated)

### Step 3: Commit Version Bump

```bash
git add -A
git commit -m "chore: bump version to 1.0.1"
```

### Step 4: Run Tests

```bash
# Run all tests
npm test

# Expected output:
# ✓ License bypass validation PASSED
# Tests passed: 7
# Tests failed: 0
```

**CRITICAL:** If license bypass test fails, **DO NOT RELEASE**.

### Step 5: Create Git Tag

```bash
# Create annotated tag
git tag -a v1.0.1 -m "Release v1.0.1"

# Verify tag
git tag -l v1.0.1
git show v1.0.1
```

### Step 6: Push to GitHub

```bash
# Push commits
git push origin main

# Push tag (triggers CI/CD)
git push origin v1.0.1
```

### Step 7: Wait for CI/CD

GitHub Actions will automatically:

1. **Validate license bypass** (blocks if fails)
2. **Build core PWA**
3. **Build platforms in parallel:**
   - Electron (Linux, Windows, macOS)
   - Android APK
   - Chrome extension
4. **Create GitHub Release**
5. **Upload all artifacts**

**Monitor progress:**
- Visit: `https://github.com/user/repo/actions`
- Check workflow run for tag `v1.0.1`
- Typical build time: 15-30 minutes

### Step 8: Verify Release

Once GitHub Actions completes:

```bash
# View release
open https://github.com/user/repo/releases/tag/v1.0.1
```

**Verify artifacts uploaded:**
- ✅ `xibo-player-core-v1.0.1.tar.gz` (Core PWA)
- ✅ `xibo-player_1.0.1_amd64.deb` (Electron Linux DEB)
- ✅ `xibo-player_1.0.1_amd64.snap` (Electron Linux Snap)
- ✅ `xibo-player-Setup-1.0.1.exe` (Electron Windows)
- ✅ `xibo-player-1.0.1.dmg` (Electron macOS)
- ✅ `xibo-player.apk` (Android)
- ✅ `xibo-player-chrome-v1.0.1.zip` (Chrome extension)

### Step 9: Update Release Notes

Edit the GitHub Release to add:
- Overview of changes
- Breaking changes (if any)
- Known issues
- Installation instructions

**Template:**
```markdown
## Xibo Player v1.0.1

### 🎉 What's New

- New feature X
- Improvement Y
- Bug fix Z

### 🐛 Bug Fixes

- Fixed issue A (#123)
- Resolved problem B (#456)

### ⚙️ Technical Changes

- Updated dependency X to version Y
- Improved performance of Z

### 📦 Installation

**Core PWA:**
```bash
wget https://github.com/user/repo/releases/download/v1.0.1/xibo-player-core-v1.0.1.tar.gz
tar -xzf xibo-player-core-v1.0.1.tar.gz
```

**Electron (Linux):**
```bash
wget https://github.com/user/repo/releases/download/v1.0.1/xibo-player_1.0.1_amd64.deb
sudo dpkg -i xibo-player_1.0.1_amd64.deb
```

**Android:**
Download APK and install on device.

**Chrome:**
Download extension zip and load unpacked in chrome://extensions/

### ⚠️ Breaking Changes

(List any breaking changes)

### 🔒 Security

- ✅ License bypass preserved (clientType: linux)
- ✅ All tests passing

### 📚 Documentation

- [Build Guide](BUILD.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Testing Guide](TESTING.md)
- [Architecture](ARCHITECTURE.md)

### 🙏 Contributors

- @username1
- @username2
```

## Automated Release Script

Alternatively, use the automated release script:

```bash
npm run release
```

**This script:**
1. Checks git status (must be clean)
2. Checks branch (should be main)
3. Runs tests
4. Builds all platforms
5. Creates git tag
6. Shows next steps

**Output:**
```
🚀 Release Automation

🔍 Checking git status...
   ✓ Git working directory is clean

🔍 Checking branch...
   ✓ On main branch

📦 Releasing version: 1.0.1

🧪 Running tests...
   ✓ All tests passed

📦 Building core package...
   ✓ Core built successfully

📦 Building platform packages...
   ✓ Electron built
   ✓ Chrome built

🏷️  Creating git tag v1.0.1...
   ✓ Tag v1.0.1 created

📝 Generating release notes...
--- Release Notes for v1.0.1 ---
feat: add PDF media support
feat: add XMR real-time messaging
refactor: restructure as monorepo
--- End Release Notes ---

✅ Release preparation complete!

Next steps:
  1. Review the tag: git show v1.0.1
  2. Push the tag: git push origin v1.0.1
  3. GitHub Actions will automatically build and release

To undo this release (if not pushed yet):
  git tag -d v1.0.1
```

## Post-Release

### Deploy to Production

After GitHub Release is created:

**PWA to displays.superpantalles.com:**
```bash
cd ~/Devel/tecman/tecman_ansible
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com
```

### Publish to Stores (Optional)

**Chrome Web Store:**
1. Download `xibo-player-chrome-v1.0.1.zip`
2. Visit: https://chrome.google.com/webstore/devconsole
3. Upload new version
4. Submit for review

**Google Play Store (Android):**
1. Download signed APK
2. Visit: https://play.google.com/console
3. Upload to Production track
4. Submit for review

**Snap Store (Linux):**
```bash
# Login
snapcraft login

# Upload
snapcraft upload xibo-player_1.0.1_amd64.snap --release=stable
```

**LG Content Store (webOS):**
1. Visit: http://seller.lgappstv.com
2. Upload IPK
3. Submit for certification

### Announce Release

**GitHub Discussions:**
- Post announcement
- Link to release notes
- Highlight key features

**Documentation:**
- Update README.md with latest version
- Update installation instructions

**Social Media:**
- Tweet release announcement
- Post to relevant forums/communities

## Hotfix Releases

For critical bugs requiring immediate release:

### 1. Create Hotfix Branch

```bash
git checkout -b hotfix/1.0.2 v1.0.1
```

### 2. Fix Bug

```bash
# Make fixes
vi packages/core/src/main.js

# Test fix
npm test
npm run build:core

# Commit
git commit -am "fix: critical bug in collection cycle"
```

### 3. Bump Patch Version

```bash
# Edit version (1.0.1 → 1.0.2)
vi packages/core/package.json

# Sync versions
npm run sync-version

# Commit
git commit -am "chore: bump version to 1.0.2"
```

### 4. Merge and Release

```bash
# Merge to main
git checkout main
git merge hotfix/1.0.2

# Tag and push
git tag -a v1.0.2 -m "Hotfix v1.0.2"
git push origin main v1.0.2

# Delete hotfix branch
git branch -d hotfix/1.0.2
```

## Rollback

If a release has critical issues:

### 1. GitHub Release

- Mark release as "Pre-release"
- Add warning to release notes
- Do NOT delete (breaks links)

### 2. Production Deployment

**Rollback PWA:**
```bash
cd ~/Devel/tecman/xibo_players
git checkout v1.0.0  # Previous version
npm run build:core

cd ~/Devel/tecman/tecman_ansible
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com
```

### 3. Revert Git Tag (if not published)

```bash
# Delete local tag
git tag -d v1.0.1

# Delete remote tag
git push origin :refs/tags/v1.0.1
```

## Release Cadence

**Recommended schedule:**

- **Patch releases**: As needed (bug fixes)
- **Minor releases**: Monthly (new features)
- **Major releases**: Annually (breaking changes)

**Pre-release versions:**
- Alpha: `1.0.0-alpha.1` (internal testing)
- Beta: `1.0.0-beta.1` (public testing)
- RC: `1.0.0-rc.1` (release candidate)

## Troubleshooting

### CI/CD Fails

**License bypass validation fails:**
```
❌ CRITICAL: License bypass missing!
```
- **STOP**: Do not proceed with release
- Check `packages/core/src/xmds.js:109`
- Ensure `clientType: 'linux'` is present
- Run `npm test` locally

**Build fails:**
- Check GitHub Actions logs
- Reproduce locally: `npm run build`
- Fix issue and push new commit
- Delete tag and recreate

**Artifacts missing:**
- Check if job completed
- Re-run failed jobs in GitHub Actions
- Manually upload missing artifacts if needed

### Version Mismatch

**Platforms have different versions:**
- Run `npm run sync-version` again
- Commit changes
- Delete tag: `git tag -d v1.0.1`
- Recreate tag

### Tag Already Exists

```
error: tag 'v1.0.1' already exists
```

**Solution:**
```bash
# Delete local tag
git tag -d v1.0.1

# Delete remote tag (if pushed)
git push origin :refs/tags/v1.0.1

# Recreate
git tag -a v1.0.1 -m "Release v1.0.1"
```

## Best Practices

1. **Always test before releasing**
   - Run full test suite
   - Test on real hardware if possible
   - Check all platforms build successfully

2. **Keep license bypass intact**
   - Never skip license bypass validation
   - This is the most critical requirement

3. **Document breaking changes**
   - Update CHANGELOG.md
   - Add migration guide if needed
   - Announce in release notes

4. **Use semantic versioning**
   - Increment major for breaking changes
   - Increment minor for new features
   - Increment patch for bug fixes

5. **Tag commits, not WIP**
   - Only tag stable, tested commits
   - Don't tag experimental features

6. **Keep release notes user-friendly**
   - Focus on user-facing changes
   - Avoid technical jargon
   - Include upgrade instructions

## References

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Build Guide](BUILD.md)
- [Testing Guide](TESTING.md)
