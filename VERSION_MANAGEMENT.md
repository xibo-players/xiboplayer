# Version Management Guide

## Version Strategy

**Package versions always match git tags.**

- Git tag: `v0.9.0` → npm packages: `@xiboplayer/*@0.9.0`
- Git tag: `v1.0.0` → npm packages: `@xiboplayer/*@1.0.0`

## Versioning Workflow

### 1. Update Package Versions

Update all packages to the new version:

```bash
# Update all package.json files
NEW_VERSION="0.9.1"
for pkg in utils schedule xmds xmr sw cache renderer core player; do
  jq --arg v "$NEW_VERSION" '.version = $v' packages/$pkg/package.json > /tmp/pkg.json
  mv /tmp/pkg.json packages/$pkg/package.json
done

# Update peer dependencies in core if major/minor version changed
# Edit packages/core/package.json peerDependencies to match
```

### 2. Test Locally

```bash
# Install dependencies
npm install

# Build PWA
cd platforms/pwa
npm run build
cd ../..
```

### 3. Commit and Tag

```bash
# Commit version bump
git add packages/*/package.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create git tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION

[Describe changes here]
"

# Push to remote
git push origin main
git push origin "v$NEW_VERSION"
```

### 4. Publish to NPM

Use Ansible playbook:

```bash
cd ~/Devel/tecman/tecman_ansible

# Test first (recommended)
ansible-playbook playbooks/xibo/publish-npm-packages.yml -e dry_run=true

# Publish for real
ansible-playbook playbooks/xibo/publish-npm-packages.yml
```

Or manually:

```bash
# Get OTP from authenticator
OTP="123456"

# Publish in order (utils first, player last)
for pkg in utils sw schedule xmds xmr cache renderer core player; do
  cd packages/$pkg
  npm publish --access public --otp="$OTP"
  cd ../..
done
```

## Version Numbering

We use **Semantic Versioning** (semver):

- `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)

**When to bump:**

- **MAJOR** (1.0.0 → 2.0.0): Breaking API changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Pre-release Versions

For pre-releases, use:

- `0.9.0` - Initial release (not 1.0.0 yet)
- `0.9.1` - Bug fix in pre-release
- `1.0.0-beta.1` - Beta release
- `1.0.0-rc.1` - Release candidate
- `1.0.0` - Stable release

## Dependency Versions

### Internal Dependencies

Use `file:../package` protocol during development:

```json
{
  "dependencies": {
    "@xiboplayer/utils": "file:../utils"
  }
}
```

When publishing, npm automatically resolves this to the published version.

### External Dependencies

**Always use latest stable versions:**

```json
{
  "dependencies": {
    "pdfjs-dist": "^4.10.38",  // Use latest 4.x
    "spark-md5": "^3.0.2"       // Use latest 3.x
  }
}
```

**Update regularly:**

```bash
# Check for updates
npm outdated

# Update to latest within semver range
npm update

# Update to absolute latest (breaking changes)
npm install package@latest
```

## Peer Dependencies

The `@xiboplayer/core` package has peer dependencies.

**When bumping to new major/minor version:**

Update `packages/core/package.json`:

```json
{
  "peerDependencies": {
    "@xiboplayer/cache": "^0.9.0",      // Match current version
    "@xiboplayer/renderer": "^0.9.0",
    "@xiboplayer/schedule": "^0.9.0",
    "@xiboplayer/xmds": "^0.9.0"
  }
}
```

## Git Tags

### Listing Tags

```bash
# List all tags
git tag -l

# Show tag details
git show v0.9.0
```

### Deleting Tags

```bash
# Delete local tag
git tag -d v0.9.0

# Delete remote tag
git push origin :refs/tags/v0.9.0
```

## NPM Package Status

### Check Published Versions

```bash
# Check single package
npm view @xiboplayer/core versions

# Check all packages
for pkg in utils schedule xmds xmr sw cache renderer core player; do
  echo -n "@xiboplayer/$pkg: "
  npm view @xiboplayer/$pkg version 2>/dev/null || echo "not published"
done
```

### Unpublish (Emergency Only)

⚠️ **WARNING**: Unpublishing is permanent and disruptive!

Only use within 72 hours and if no one depends on the package:

```bash
npm unpublish @xiboplayer/utils@0.9.0 --otp=123456
```

## Changelog

Maintain `CHANGELOG.md` in root:

```markdown
# Changelog

## [0.9.0] - 2026-02-10

### Added
- Initial modular package structure
- 9 separate npm packages
- PWA platform support

### Changed
- Split monolithic core into modules

## [1.0.0] - TBD

### Added
- Stable API
```

## CI/CD Integration

For automated releases:

1. **GitHub Actions** (future):
   ```yaml
   - name: Publish to NPM
     run: npm publish --access public
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

2. **Ansible** (current):
   ```bash
   ansible-playbook playbooks/xibo/publish-npm-packages.yml \
     -e npm_version_bump=patch
   ```

## Quick Reference

| Action | Command |
|--------|---------|
| Bump version | Edit package.json files, update peer deps |
| Test build | `cd platforms/pwa && npm run build` |
| Create tag | `git tag -a v0.9.0 -m "..."` |
| Publish | `ansible-playbook playbooks/xibo/publish-npm-packages.yml` |
| Check published | `npm view @xiboplayer/core version` |
| List tags | `git tag -l` |

---

**Current Version**: v0.9.0 (2026-02-10)

**Next Version**: 1.0.0 (when API is stable)
