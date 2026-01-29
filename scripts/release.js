#!/usr/bin/env node
/**
 * Release Automation Script
 *
 * Orchestrates the complete release process:
 * - Validates git status
 * - Runs tests
 * - Builds all platforms
 * - Creates git tag
 * - Generates release notes
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Execute command with output
 */
function exec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: rootDir,
      stdio: 'inherit',
      ...options
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

/**
 * Execute command and capture output
 */
function execCapture(command) {
  try {
    return execSync(command, {
      cwd: rootDir,
      encoding: 'utf8'
    }).trim();
  } catch (error) {
    return '';
  }
}

/**
 * Get current version from core package
 */
function getCurrentVersion() {
  const pkgPath = join(rootDir, 'packages/core/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

/**
 * Check if git working directory is clean
 */
function checkGitStatus() {
  console.log('🔍 Checking git status...');

  const status = execCapture('git status --porcelain');
  if (status) {
    console.error('❌ Git working directory is not clean');
    console.error('Please commit or stash your changes first');
    console.log('\nUncommitted changes:');
    console.log(status);
    process.exit(1);
  }

  console.log('   ✓ Git working directory is clean\n');
}

/**
 * Ensure we're on main branch
 */
function checkBranch() {
  console.log('🔍 Checking branch...');

  const branch = execCapture('git branch --show-current');
  if (branch !== 'main' && branch !== 'master') {
    console.warn(`⚠ You're on branch "${branch}", not main/master`);
    console.warn('Releases are typically made from main branch');
    console.log('');
  } else {
    console.log(`   ✓ On ${branch} branch\n`);
  }
}

/**
 * Run tests (if available)
 */
function runTests() {
  console.log('🧪 Running tests...');

  const pkgPath = join(rootDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  if (pkg.scripts && pkg.scripts.test) {
    try {
      exec('npm test');
      console.log('   ✓ All tests passed\n');
    } catch (error) {
      console.error('❌ Tests failed');
      process.exit(1);
    }
  } else {
    console.log('   ⊘ No test script defined, skipping\n');
  }
}

/**
 * Build core package
 */
function buildCore() {
  console.log('📦 Building core package...');
  exec('npm run build:core');
  console.log('   ✓ Core built successfully\n');
}

/**
 * Build platform packages
 */
function buildPlatforms() {
  console.log('📦 Building platform packages...');

  // Build Electron if available
  if (existsSync(join(rootDir, 'platforms/electron/package.json'))) {
    console.log('   Building Electron...');
    try {
      exec('npm run build:electron');
      console.log('   ✓ Electron built');
    } catch (error) {
      console.warn('   ⚠ Electron build failed');
    }
  }

  // Build Chrome if available
  if (existsSync(join(rootDir, 'platforms/chrome/package.json'))) {
    console.log('   Building Chrome extension...');
    try {
      exec('npm run build:chrome');
      console.log('   ✓ Chrome built');
    } catch (error) {
      console.warn('   ⚠ Chrome build failed');
    }
  }

  // Note: Android and webOS builds are typically done in CI
  console.log('   ℹ Android and webOS builds should be done in CI/CD\n');
}

/**
 * Create git tag
 */
function createTag(version) {
  console.log(`🏷️  Creating git tag v${version}...`);

  const tagExists = execCapture(`git tag -l v${version}`);
  if (tagExists) {
    console.error(`❌ Tag v${version} already exists`);
    process.exit(1);
  }

  exec(`git tag -a v${version} -m "Release v${version}"`);
  console.log(`   ✓ Tag v${version} created\n`);
}

/**
 * Generate release notes
 */
function generateReleaseNotes(version) {
  console.log('📝 Generating release notes...');

  try {
    // Get commits since last tag
    const lastTag = execCapture('git describe --tags --abbrev=0 HEAD^ 2>/dev/null') || '';
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';

    const commits = execCapture(`git log ${range} --pretty=format:"%s" --no-merges`);

    if (commits) {
      console.log('\n--- Release Notes for v' + version + ' ---');
      console.log(commits);
      console.log('--- End Release Notes ---\n');
    } else {
      console.log('   ⊘ No commits found for release notes\n');
    }
  } catch (error) {
    console.log('   ⊘ Could not generate release notes\n');
  }
}

/**
 * Display next steps
 */
function displayNextSteps(version) {
  console.log('✅ Release preparation complete!\n');
  console.log('Next steps:');
  console.log(`  1. Review the tag: git show v${version}`);
  console.log(`  2. Push the tag: git push origin v${version}`);
  console.log(`  3. GitHub Actions will automatically build and release`);
  console.log('\nTo undo this release (if not pushed yet):');
  console.log(`  git tag -d v${version}`);
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Release Automation\n');

  // Pre-flight checks
  checkGitStatus();
  checkBranch();

  // Get version
  const version = getCurrentVersion();
  console.log(`📦 Releasing version: ${version}\n`);

  // Run tests
  runTests();

  // Build packages
  buildCore();
  buildPlatforms();

  // Create tag
  createTag(version);

  // Generate release notes
  generateReleaseNotes(version);

  // Display next steps
  displayNextSteps(version);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getCurrentVersion, checkGitStatus, buildCore };
