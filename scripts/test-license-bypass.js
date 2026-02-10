#!/usr/bin/env node
/**
 * License Bypass Validation Test
 *
 * CRITICAL: Ensures that clientType: 'linux' is preserved in xmds.js
 *
 * This is the most important test in the entire codebase because:
 * - clientType: 'linux' tells CMS to set commercialLicence=3 (not applicable)
 * - This bypasses all 30-day trials and license validation
 * - Without this, the player would require commercial licenses
 *
 * This test MUST pass before any release.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

/**
 * Log test result
 */
function test(name, passed, details = '') {
  if (passed) {
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } else {
    console.log(`${RED}✗${RESET} ${name}`);
    if (details) {
      console.log(`  ${details}`);
    }
    testsFailed++;
  }
}

/**
 * Test xmds.js contains clientType: 'linux'
 */
function testXmdsClientType() {
  const xmdsPath = join(rootDir, 'packages/xmds/src/xmds.js');

  if (!existsSync(xmdsPath)) {
    test('xmds.js exists', false, `File not found: ${xmdsPath}`);
    return;
  }

  test('xmds.js exists', true);

  const content = readFileSync(xmdsPath, 'utf8');

  // Check for exact string
  const hasLinuxClientType = content.includes("clientType: 'linux'");
  test(
    'xmds.js contains clientType: \'linux\'',
    hasLinuxClientType,
    hasLinuxClientType ? '' : 'CRITICAL: clientType must be "linux" to bypass commercial license'
  );

  // Check it's in RegisterDisplay method (more lenient regex)
  const registerDisplayMatch = content.match(/registerDisplay\(\)[^]*?clientType:\s*'linux'/s);
  test(
    'clientType: \'linux\' is in RegisterDisplay method',
    !!registerDisplayMatch,
    registerDisplayMatch ? '' : 'clientType should be in RegisterDisplay SOAP call'
  );

  // Ensure it's not commented out
  const lines = content.split('\n');
  const clientTypeLine = lines.find(line => line.includes("clientType: 'linux'"));
  if (clientTypeLine) {
    const isCommented = clientTypeLine.trim().startsWith('//') || clientTypeLine.trim().startsWith('/*');
    test(
      'clientType: \'linux\' is not commented out',
      !isCommented,
      isCommented ? 'CRITICAL: clientType line is commented out!' : ''
    );
  }

  // Check for warning comment
  const hasWarningComment = content.includes('CRITICAL') || content.includes('bypass');
  test(
    'Warning comment present near clientType',
    hasWarningComment,
    hasWarningComment ? '' : 'Consider adding a warning comment to prevent accidental changes'
  );
}

/**
 * Test that no other clientType values exist
 */
function testNoOtherClientTypes() {
  const xmdsPath = join(rootDir, 'packages/xmds/src/xmds.js');
  const content = readFileSync(xmdsPath, 'utf8');

  // Check for other dangerous clientType values
  const dangerousTypes = ['windows', 'android', 'webos', 'lg'];
  let foundDangerous = false;
  let dangerousValue = '';

  for (const type of dangerousTypes) {
    if (content.includes(`clientType: '${type}'`)) {
      foundDangerous = true;
      dangerousValue = type;
      break;
    }
  }

  test(
    'No commercial clientType values found',
    !foundDangerous,
    foundDangerous ? `CRITICAL: Found clientType: '${dangerousValue}' - this requires commercial license!` : ''
  );
}

/**
 * Test Electron config if it exists
 */
function testElectronClientType() {
  const electronConfigPath = join(rootDir, 'platforms/electron/src/main/config/config.ts');

  if (!existsSync(electronConfigPath)) {
    console.log(`${YELLOW}⊘${RESET} Electron config not found (skipped)`);
    return;
  }

  const content = readFileSync(electronConfigPath, 'utf8');

  // Check for return 'linux' in getXmdsPlayerType
  const hasLinuxReturn = content.includes("return 'linux'");
  test(
    'Electron config returns \'linux\' for player type',
    hasLinuxReturn,
    hasLinuxReturn ? '' : 'Electron should also use linux client type'
  );
}

/**
 * Main execution
 */
function main() {
  console.log('🔒 License Bypass Validation Test\n');
  console.log('This test ensures commercial license bypass is preserved.\n');

  testXmdsClientType();
  console.log('');
  testNoOtherClientTypes();
  console.log('');
  testElectronClientType();
  console.log('');

  // Summary
  console.log('─'.repeat(50));
  console.log(`Tests passed: ${GREEN}${testsPassed}${RESET}`);
  console.log(`Tests failed: ${testsFailed > 0 ? RED : RESET}${testsFailed}${RESET}`);
  console.log('─'.repeat(50));

  if (testsFailed > 0) {
    console.log(`\n${RED}CRITICAL: License bypass validation FAILED${RESET}`);
    console.log('\nThe clientType MUST be "linux" to bypass commercial licenses.');
    console.log('DO NOT release until this is fixed.\n');
    process.exit(1);
  } else {
    console.log(`\n${GREEN}✓ License bypass validation PASSED${RESET}`);
    console.log('Commercial license bypass is correctly preserved.\n');
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { testXmdsClientType, testNoOtherClientTypes };
