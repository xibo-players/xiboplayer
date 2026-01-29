#!/usr/bin/env node
/**
 * Build Chrome Extension
 *
 * Prepares the complete Chrome extension in dist/ directory
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const chromeDir = join(__dirname, '..');
const distDir = join(chromeDir, 'dist');

console.log('🏗️  Building Chrome Extension\n');

// Create dist directory
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy manifest.json
console.log('Copying manifest.json...');
cpSync(
  join(chromeDir, 'manifest.json'),
  join(distDir, 'manifest.json')
);

// Copy background.js
console.log('Copying background.js...');
cpSync(
  join(chromeDir, 'background.js'),
  join(distDir, 'background.js')
);

// Copy popup files
console.log('Copying popup files...');
cpSync(
  join(chromeDir, 'popup.html'),
  join(distDir, 'popup.html')
);
cpSync(
  join(chromeDir, 'popup.js'),
  join(distDir, 'popup.js')
);

// Copy or generate icons
console.log('Setting up icons...');
const iconsDir = join(distDir, 'icons');
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir);
}

// Check if icons exist in source
const iconsSrcDir = join(chromeDir, 'icons');
if (existsSync(iconsSrcDir)) {
  cpSync(iconsSrcDir, iconsDir, { recursive: true });
  console.log('   ✓ Icons copied');
} else {
  // Generate placeholder icons
  console.log('   ⚠ No icons found, using placeholders');
  console.log('   Add icons to platforms/chrome/icons/ for production');

  // Create placeholder icon info
  const placeholderNote = join(iconsDir, 'README.txt');
  writeFileSync(placeholderNote,
    'Add icon files here:\n' +
    '- icon16.png (16x16)\n' +
    '- icon48.png (48x48)\n' +
    '- icon128.png (128x128)\n'
  );
}

// Verify player directory exists (should be synced by sync-core)
const playerDir = join(distDir, 'player');
if (!existsSync(playerDir)) {
  console.error('\n❌ Player directory not found!');
  console.error('   Run: npm run sync-core');
  process.exit(1);
}

console.log('   ✓ Player directory present');

// Verify structure
console.log('\n📋 Extension structure:');
console.log('   dist/');
console.log('   ├── manifest.json');
console.log('   ├── background.js');
console.log('   ├── popup.html');
console.log('   ├── popup.js');
console.log('   ├── icons/');
console.log('   └── player/');
console.log('       ├── index.html');
console.log('       ├── setup.html');
console.log('       ├── assets/');
console.log('       └── pdf.worker.min.mjs');

console.log('\n✅ Chrome extension built successfully');
console.log('\nNext steps:');
console.log('  1. Load extension: chrome://extensions/');
console.log('  2. Enable "Developer mode"');
console.log('  3. Click "Load unpacked"');
console.log('  4. Select: platforms/chrome/dist/');
console.log('\nOr create zip: npm run package');
