#!/usr/bin/env node
/**
 * Version Synchronization Script
 *
 * Keeps all platform package versions synchronized with the core version.
 * Generates platform-specific version strings with timestamps.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Read and parse JSON file
 */
function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`Failed to read ${path}:`, error.message);
    return null;
  }
}

/**
 * Write JSON file with pretty formatting
 */
function writeJSON(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error(`Failed to write ${path}:`, error.message);
    return false;
  }
}

/**
 * Get core version (source of truth)
 */
function getCoreVersion() {
  const corePkgPath = join(rootDir, 'packages/core/package.json');
  const pkg = readJSON(corePkgPath);
  if (!pkg || !pkg.version) {
    console.error('❌ Could not read core package version');
    process.exit(1);
  }
  return pkg.version;
}

/**
 * Generate platform-specific version with build number
 */
function generatePlatformVersion(coreVersion, platform) {
  // Use last 6 digits of timestamp as build number
  const buildNumber = Date.now().toString().slice(-6);
  return `${coreVersion}-${platform}.${buildNumber}`;
}

/**
 * Update platform package.json version
 */
function updatePlatformVersion(platform, coreVersion) {
  const pkgPath = join(rootDir, `platforms/${platform}/package.json`);

  if (!existsSync(pkgPath)) {
    console.log(`   ⊘ ${platform}: package.json not found, skipping`);
    return false;
  }

  const pkg = readJSON(pkgPath);
  if (!pkg) {
    return false;
  }

  const oldVersion = pkg.version;
  pkg.version = generatePlatformVersion(coreVersion, platform);

  if (writeJSON(pkgPath, pkg)) {
    console.log(`   ✓ ${platform}: ${oldVersion} → ${pkg.version}`);
    return true;
  }

  return false;
}

/**
 * Update Android gradle version
 */
function updateAndroidVersion(coreVersion) {
  const gradlePath = join(rootDir, 'platforms/android/app/build.gradle');

  if (!existsSync(gradlePath)) {
    console.log('   ⊘ android: build.gradle not found, skipping');
    return false;
  }

  try {
    let content = readFileSync(gradlePath, 'utf8');

    // Parse semantic version
    const [major, minor, patch] = coreVersion.split('.').map(n => parseInt(n) || 0);
    const versionCode = major * 10000 + minor * 100 + patch;

    // Update versionCode and versionName
    content = content.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`
    );
    content = content.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${coreVersion}"`
    );

    writeFileSync(gradlePath, content);
    console.log(`   ✓ android: versionCode ${versionCode}, versionName "${coreVersion}"`);
    return true;
  } catch (error) {
    console.error(`   ✗ android: ${error.message}`);
    return false;
  }
}

/**
 * Update webOS appinfo.json version
 */
function updateWebOSVersion(coreVersion) {
  const appinfoPath = join(rootDir, 'platforms/webos/appinfo.json');

  if (!existsSync(appinfoPath)) {
    console.log('   ⊘ webos: appinfo.json not found, skipping');
    return false;
  }

  const appinfo = readJSON(appinfoPath);
  if (!appinfo) {
    return false;
  }

  const oldVersion = appinfo.version;
  appinfo.version = coreVersion;

  if (writeJSON(appinfoPath, appinfo)) {
    console.log(`   ✓ webos: ${oldVersion} → ${coreVersion}`);
    return true;
  }

  return false;
}

/**
 * Update Chrome manifest version
 */
function updateChromeVersion(coreVersion) {
  const manifestPath = join(rootDir, 'platforms/chrome/manifest.json');

  if (!existsSync(manifestPath)) {
    console.log('   ⊘ chrome: manifest.json not found, skipping');
    return false;
  }

  const manifest = readJSON(manifestPath);
  if (!manifest) {
    return false;
  }

  const oldVersion = manifest.version;
  manifest.version = coreVersion;

  if (writeJSON(manifestPath, manifest)) {
    console.log(`   ✓ chrome: ${oldVersion} → ${coreVersion}`);
    return true;
  }

  return false;
}

/**
 * Generate CHANGELOG entry
 */
function generateChangelog() {
  console.log('\n📝 Generating changelog...');

  try {
    // Use conventional-changelog if available
    if (existsSync(join(rootDir, 'node_modules/.bin/conventional-changelog'))) {
      execSync(
        'npx conventional-changelog -p angular -i CHANGELOG.md -s',
        { cwd: rootDir, stdio: 'inherit' }
      );
      console.log('   ✓ CHANGELOG.md updated');
    } else {
      console.log('   ⊘ conventional-changelog not installed, skipping');
    }
  } catch (error) {
    console.warn('   ⚠ Changelog generation failed:', error.message);
  }
}

/**
 * Validate license bypass is preserved
 */
function validateLicenseBypass() {
  console.log('\n🔒 Validating license bypass...');

  const xmdsPath = join(rootDir, 'packages/core/src/xmds.js');
  const xmdsContent = readFileSync(xmdsPath, 'utf8');

  // Check for clientType: 'linux'
  if (xmdsContent.includes("clientType: 'linux'")) {
    console.log('   ✓ License bypass preserved in xmds.js');
    return true;
  } else {
    console.error('   ❌ LICENSE BYPASS MISSING IN xmds.js');
    console.error('   CRITICAL: clientType must be "linux" to bypass commercial license');
    process.exit(1);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('📦 Version Synchronization\n');

  // Get core version
  const coreVersion = getCoreVersion();
  console.log(`Core version: ${coreVersion}\n`);

  // Update platform versions
  console.log('Updating platform versions:');
  updatePlatformVersion('electron', coreVersion);
  updatePlatformVersion('chrome', coreVersion);
  updateAndroidVersion(coreVersion);
  updateWebOSVersion(coreVersion);
  updateChromeVersion(coreVersion);

  // Validate license bypass
  validateLicenseBypass();

  // Generate changelog
  generateChangelog();

  console.log('\n✅ Version synchronization complete');
  console.log(`\nNext steps:`);
  console.log(`  1. Review changes: git diff`);
  console.log(`  2. Commit: git commit -am "chore: bump version to ${coreVersion}"`);
  console.log(`  3. Tag: git tag v${coreVersion}`);
  console.log(`  4. Push: git push origin main --tags`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getCoreVersion, generatePlatformVersion, validateLicenseBypass };
