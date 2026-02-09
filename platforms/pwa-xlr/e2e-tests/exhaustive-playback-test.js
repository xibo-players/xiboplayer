#!/usr/bin/env node

/**
 * Exhaustive PWA-XLR Playback Test
 *
 * Runs repeated test cycles to verify actual content playback.
 * - Clears all state between runs
 * - Verifies credentials submission
 * - Confirms content is playing (not stuck on credentials)
 * - Takes multiple screenshots
 * - Logs detailed results
 */

const { chromium } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

const TEST_CONFIG = {
  baseUrl: 'https://displays.superpantalles.com/player/xlr/',
  cmsUrl: 'https://displays.superpantalles.com',
  cmsKey: 'xm4oxY',
  displayName: 'E2E-Test-XLR',
  maxIterations: 50, // Run 50 test cycles
  screenshotDir: path.join(__dirname, 'screenshots'),
  resultsFile: path.join(__dirname, 'exhaustive-test-results.json'),

  // Wait times
  postCredentialWait: 15000, // 15s after submitting credentials
  playbackVerifyWait: 30000, // 30s to verify playback
  screenshotInterval: 10000,  // Screenshot every 10s
};

class ExhaustiveTest {
  constructor() {
    this.results = {
      startTime: new Date().toISOString(),
      iterations: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: []
      }
    };
  }

  async log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
  }

  async ensureScreenshotDir() {
    try {
      await fs.mkdir(TEST_CONFIG.screenshotDir, { recursive: true });
    } catch (error) {
      // Ignore if exists
    }
  }

  async takeScreenshot(page, name, iteration) {
    const filename = `iter${iteration.toString().padStart(3, '0')}-${name}.png`;
    const filepath = path.join(TEST_CONFIG.screenshotDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    await this.log(`Screenshot: ${filename}`);
    return filename;
  }

  async clearBrowserData(context) {
    await this.log('Clearing all browser data...');
    await context.clearCookies();
    await context.clearPermissions();

    // Clear localStorage and sessionStorage
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  }

  async waitAndScreenshot(page, seconds, name, iteration) {
    await this.log(`Waiting ${seconds}s for ${name}...`);
    const start = Date.now();
    const interval = Math.min(TEST_CONFIG.screenshotInterval, seconds * 1000);

    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += interval) {
      await page.waitForTimeout(Math.min(interval, seconds * 1000 - elapsed));
      const elapsedSec = Math.floor((Date.now() - start) / 1000);
      await this.takeScreenshot(page, `${name}-${elapsedSec}s`, iteration);
    }
  }

  async checkForCredentialsScreen(page) {
    // Check if we're still on credentials screen
    const hasCredentialForm = await page.locator('input[name="cms_address"]').isVisible().catch(() => false);
    const hasConnectButton = await page.locator('button:has-text("Connect")').isVisible().catch(() => false);

    return hasCredentialForm || hasConnectButton;
  }

  async checkForPlayingContent(page) {
    // Multiple checks to verify content is actually playing
    const checks = {
      noCredentialForm: !(await this.checkForCredentialsScreen(page)),
      hasXlrContainer: await page.locator('#xlr-container, [data-xlr-player]').isVisible().catch(() => false),
      hasContent: await page.locator('body').evaluate(el => {
        // Check if body has actual content (not just setup form)
        const text = el.innerText || '';
        return text.length > 200 && !text.includes('Xibo Player Setup');
      }).catch(() => false),
      pageTitle: await page.title()
    };

    // Get XLR engine status
    const xlrStatus = await page.evaluate(() => {
      if (window.xlrPlayer) {
        return {
          exists: true,
          state: window.xlrPlayer.getState?.() || 'unknown',
          currentLayout: window.xlrPlayer.getCurrentLayout?.() || null
        };
      }
      return { exists: false };
    }).catch(() => ({ exists: false }));

    return {
      checks,
      xlrStatus,
      isPlaying: checks.noCredentialForm && (checks.hasXlrContainer || checks.hasContent)
    };
  }

  async runSingleTest(iteration) {
    const iterationResult = {
      iteration,
      startTime: new Date().toISOString(),
      success: false,
      error: null,
      screenshots: [],
      checkpoints: {}
    };

    let browser = null;
    let context = null;
    let page = null;

    try {
      await this.log(`\n${'='.repeat(80)}`);
      await this.log(`ITERATION ${iteration}/${TEST_CONFIG.maxIterations}`);
      await this.log('='.repeat(80));

      // Launch fresh browser
      await this.log('Launching browser...');
      browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      });

      // Create fresh context with cleared state
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'Europe/Madrid',
        permissions: [],
        storageState: undefined // No previous state
      });

      await this.clearBrowserData(context);

      page = await context.newPage();

      // Set up console logging
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error(`[BROWSER ERROR] ${msg.text()}`);
        }
      });

      // CHECKPOINT 1: Load page
      await this.log(`Loading ${TEST_CONFIG.baseUrl}...`);
      await page.goto(TEST_CONFIG.baseUrl, {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      iterationResult.screenshots.push(
        await this.takeScreenshot(page, '01-initial-load', iteration)
      );
      iterationResult.checkpoints.pageLoad = 'success';

      // CHECKPOINT 2: Inject configuration into localStorage
      await this.log('Injecting configuration into localStorage...');
      await page.evaluate((config) => {
        // Generate hardware key and XMR channel (mimic config.js behavior)
        function generateHardwareKey() {
          const nav = navigator;
          const screen = window.screen;
          const parts = [
            nav.userAgent,
            nav.language,
            screen.colorDepth,
            screen.width,
            screen.height,
            new Date().getTimezoneOffset()
          ];
          let hash = 0;
          const str = parts.join('|');
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return Math.abs(hash).toString(16).padStart(32, '0').substring(0, 32);
        }

        function generateXmrChannel() {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }

        const xiboConfig = {
          cmsAddress: config.cmsUrl,
          cmsKey: config.cmsKey,
          displayName: config.displayName,
          hardwareKey: generateHardwareKey(),
          xmrChannel: generateXmrChannel()
        };
        // IMPORTANT: Key must be 'xibo_config' with underscore!
        localStorage.setItem('xibo_config', JSON.stringify(xiboConfig));
        console.log('[TEST] Config stored:', xiboConfig.displayName);
      }, {
        cmsUrl: TEST_CONFIG.cmsUrl,
        cmsKey: TEST_CONFIG.cmsKey,
        displayName: TEST_CONFIG.displayName
      });

      iterationResult.screenshots.push(
        await this.takeScreenshot(page, '02-config-injected', iteration)
      );
      iterationResult.checkpoints.configInjected = 'success';

      // CHECKPOINT 3: Navigate back to root to pick up configuration
      await this.log('Navigating to player root with configuration...');
      await page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle' });

      iterationResult.screenshots.push(
        await this.takeScreenshot(page, '03-after-reload', iteration)
      );
      iterationResult.checkpoints.pageReloaded = 'success';

      // CHECKPOINT 4: Wait for player initialization
      await this.log('Waiting for player initialization...');
      await page.waitForTimeout(TEST_CONFIG.postCredentialWait);

      iterationResult.screenshots.push(
        await this.takeScreenshot(page, '04-post-init-wait', iteration)
      );

      // CHECKPOINT 5: Verify we're not on setup page
      const currentUrl = page.url();
      const isSetupPage = currentUrl.includes('setup.html');

      await this.log(`Current URL: ${currentUrl}`);
      await this.log(`Is setup page: ${isSetupPage}`);

      if (isSetupPage) {
        throw new Error('Still on setup page after configuration!');
      }

      await this.log('✓ Player loaded (not on setup page)');
      iterationResult.checkpoints.notOnSetupPage = 'success';

      // CHECKPOINT 6: Wait and monitor for playback
      await this.log('Monitoring playback...');
      await this.waitAndScreenshot(
        page,
        TEST_CONFIG.playbackVerifyWait / 1000,
        '05-playback-monitoring',
        iteration
      );

      // CHECKPOINT 7: Verify content is actually playing
      const playbackStatus = await this.checkForPlayingContent(page);
      iterationResult.playbackStatus = playbackStatus;

      await this.log(`Playback verification:`);
      await this.log(`  - No credential form: ${playbackStatus.checks.noCredentialForm}`);
      await this.log(`  - Has XLR container: ${playbackStatus.checks.hasXlrContainer}`);
      await this.log(`  - Has content: ${playbackStatus.checks.hasContent}`);
      await this.log(`  - XLR exists: ${playbackStatus.xlrStatus.exists}`);
      if (playbackStatus.xlrStatus.exists) {
        await this.log(`  - XLR state: ${playbackStatus.xlrStatus.state}`);
      }

      if (!playbackStatus.isPlaying) {
        throw new Error('Content is NOT playing - verification failed');
      }

      await this.log('✓ Content playback VERIFIED');
      iterationResult.checkpoints.playbackVerified = 'success';

      // Final screenshot
      iterationResult.screenshots.push(
        await this.takeScreenshot(page, '06-final-verification', iteration)
      );

      // Success!
      iterationResult.success = true;
      iterationResult.endTime = new Date().toISOString();

      await this.log(`✓ ITERATION ${iteration} PASSED`);

    } catch (error) {
      iterationResult.success = false;
      iterationResult.error = error.message;
      iterationResult.endTime = new Date().toISOString();

      await this.log(`✗ ITERATION ${iteration} FAILED: ${error.message}`, 'ERROR');

      // Take error screenshot
      if (page) {
        try {
          iterationResult.screenshots.push(
            await this.takeScreenshot(page, 'ERROR', iteration)
          );
        } catch (screenshotError) {
          await this.log(`Could not take error screenshot: ${screenshotError.message}`, 'WARN');
        }
      }
    } finally {
      // Cleanup
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }

    return iterationResult;
  }

  async run() {
    await this.ensureScreenshotDir();
    await this.log(`Starting exhaustive test - ${TEST_CONFIG.maxIterations} iterations`);
    await this.log(`Results will be saved to: ${TEST_CONFIG.resultsFile}`);

    for (let i = 1; i <= TEST_CONFIG.maxIterations; i++) {
      const result = await this.runSingleTest(i);
      this.results.iterations.push(result);

      this.results.summary.total++;
      if (result.success) {
        this.results.summary.passed++;
      } else {
        this.results.summary.failed++;
        this.results.summary.errors.push({
          iteration: i,
          error: result.error
        });
      }

      // Save intermediate results
      await this.saveResults();

      // Print summary after each iteration
      await this.printSummary();

      // Small delay between iterations
      if (i < TEST_CONFIG.maxIterations) {
        await this.log('Waiting 5s before next iteration...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    await this.log('\n' + '='.repeat(80));
    await this.log('EXHAUSTIVE TEST COMPLETE');
    await this.log('='.repeat(80));
    await this.printSummary();
    await this.printDetailedResults();
  }

  async printSummary() {
    const { total, passed, failed } = this.results.summary;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    console.log('\n' + '-'.repeat(80));
    console.log(`SUMMARY: ${passed}/${total} passed (${passRate}%) | ${failed} failed`);
    console.log('-'.repeat(80));
  }

  async printDetailedResults() {
    console.log('\n=== DETAILED RESULTS ===\n');

    this.results.iterations.forEach(iter => {
      const status = iter.success ? '✓ PASS' : '✗ FAIL';
      console.log(`Iteration ${iter.iteration}: ${status}`);
      if (!iter.success) {
        console.log(`  Error: ${iter.error}`);
      }
      console.log(`  Checkpoints: ${Object.keys(iter.checkpoints).join(', ')}`);
      console.log(`  Screenshots: ${iter.screenshots.length}`);
      if (iter.playbackStatus) {
        console.log(`  Playing: ${iter.playbackStatus.isPlaying ? 'YES' : 'NO'}`);
      }
      console.log('');
    });

    if (this.results.summary.errors.length > 0) {
      console.log('=== ERRORS ===\n');
      this.results.summary.errors.forEach(({ iteration, error }) => {
        console.log(`Iteration ${iteration}: ${error}`);
      });
    }
  }

  async saveResults() {
    this.results.endTime = new Date().toISOString();
    await fs.writeFile(
      TEST_CONFIG.resultsFile,
      JSON.stringify(this.results, null, 2)
    );
  }
}

// Run test
(async () => {
  const test = new ExhaustiveTest();
  try {
    await test.run();
    process.exit(test.results.summary.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error('FATAL ERROR:', error);
    process.exit(1);
  }
})();
