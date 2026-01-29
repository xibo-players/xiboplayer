#!/usr/bin/env node
/**
 * Sync Core PWA to Chrome Extension
 *
 * Copies the built core PWA files into the Chrome extension dist/player/ directory
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const chromeDir = join(__dirname, '..');
const rootDir = join(__dirname, '..', '..', '..');

const coreDistDir = join(rootDir, 'packages/core/dist');
const chromePlayerDir = join(chromeDir, 'dist/player');

console.log('📦 Syncing Core PWA to Chrome Extension\n');

// Check if core dist exists
if (!existsSync(coreDistDir)) {
  console.error('❌ Core dist not found!');
  console.error('   Run: npm run build:core');
  process.exit(1);
}

console.log('   Core dist:', coreDistDir);
console.log('   Chrome player:', chromePlayerDir);

// Clean and create chrome player directory
if (existsSync(chromePlayerDir)) {
  rmSync(chromePlayerDir, { recursive: true });
}
mkdirSync(chromePlayerDir, { recursive: true });

// Copy core dist to chrome/dist/player/
try {
  cpSync(coreDistDir, chromePlayerDir, { recursive: true });
  console.log('\n✓ Core PWA synced to Chrome extension');

  // Verify critical files
  const criticalFiles = ['index.html', 'setup.html'];
  let allPresent = true;

  for (const file of criticalFiles) {
    const filePath = join(chromePlayerDir, file);
    if (existsSync(filePath)) {
      console.log(`   ✓ ${file}`);
    } else {
      console.error(`   ✗ ${file} missing`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.error('\n❌ Some critical files are missing');
    process.exit(1);
  }

  console.log('\n✅ Sync complete');
} catch (error) {
  console.error('❌ Sync failed:', error.message);
  process.exit(1);
}
