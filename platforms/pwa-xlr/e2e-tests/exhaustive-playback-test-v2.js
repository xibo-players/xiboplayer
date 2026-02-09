#!/usr/bin/env node

/**
 * Exhaustive PWA-XLR Playback Test V2
 *
 * Key fix: Authenticate ONCE, then reuse browser context
 * (once authenticated, player should stay authenticated)
 */

const { chromium } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

const TEST_CONFIG = {
  baseUrl: 'https://displays.superpantalles.com/player/xlr/',
  cmsUrl: 'https://displays.superpantalles.com',
  cmsKey: 'isiSdUCy',
  displayName: 'E2E-Test-XLR-Persistent',
  maxIterations: 50,
  screenshotDir: path.join(__dirname, 'screenshots'),
  resultsFile: path.join(__dirname, 'exhaustive-test-results.json'),

  // Wait times
  initialAuthWait: 20000,  // 20s for initial authentication
  betweenChecks: 10000,    // 10s between playback checks
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

    this.browser = null;
    this.context = null;
    this.page = null;
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

  async takeScreenshot(name, iteration) {
    const filename = `iter${iteration.toString().padStart(3, '0')}-${name}.png`;
    const filepath = path.join(TEST_CONFIG.screenshotDir, filename);
    await this.page.screenshot({ path: filepath, fullPage: false });
    await this.log(`Screenshot: ${filename}`);
    return filename;
  }

  async setupBrowserOnce() {
    await this.log('Setting up browser (ONE TIME SETUP)...');

    // Launch browser
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    // Create context (will be reused!)
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'Europe/Madrid',
    });

    this.page = await this.context.newPage();

    // Set up console logging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[BROWSER ERROR] ${msg.text()}`);
      }
    });

    await this.log('✓ Browser setup complete');
  }

  async authenticateOnce() {
    await this.log('\n=== ONE-TIME AUTHENTICATION ===');

    // Load player
    await this.log(`Loading ${TEST_CONFIG.baseUrl}...`);
    await this.page.goto(TEST_CONFIG.baseUrl, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    await this.takeScreenshot('auth-01-initial', 0);

    // Inject configuration
    await this.log('Injecting configuration...');
    await this.page.evaluate((config) => {
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
      localStorage.setItem('xibo_config', JSON.stringify(xiboConfig));
      console.log('[TEST] Config stored:', xiboConfig.displayName);
    }, {
      cmsUrl: TEST_CONFIG.cmsUrl,
      cmsKey: TEST_CONFIG.cmsKey,
      displayName: TEST_CONFIG.displayName
    });

    await this.takeScreenshot('auth-02-config-injected', 0);

    // Navigate to root to pick up config
    await this.log('Navigating with configuration...');
    await this.page.goto(TEST_CONFIG.baseUrl, { waitUntil: 'networkidle' });

    await this.takeScreenshot('auth-03-after-config', 0);

    // Wait for authentication/initialization
    await this.log(`Waiting ${TEST_CONFIG.initialAuthWait/1000}s for authentication...`);
    await this.page.waitForTimeout(TEST_CONFIG.initialAuthWait);

    await this.takeScreenshot('auth-04-authenticated', 0);

    // Check if we're authenticated (not on setup page)
    const currentUrl = this.page.url();
    const isSetupPage = currentUrl.includes('setup.html');

    await this.log(`Current URL: ${currentUrl}`);
    await this.log(`On setup page: ${isSetupPage}`);

    if (isSetupPage) {
      throw new Error('Authentication failed - still on setup page!');
    }

    await this.log('✓ AUTHENTICATION SUCCESSFUL');
    await this.log('=== STARTING CONTINUOUS MONITORING ===\n');
  }

  async checkPlaybackStatus(iteration) {
    // Check if content is playing
    const playbackStatus = await this.page.evaluate(() => {
      const checks = {
        url: window.location.href,
        isSetupPage: window.location.href.includes('setup.html'),
        hasXlrContainer: !!document.querySelector('#xlr-container, [data-xlr-player]'),
        bodyTextLength: document.body.innerText.length,
        bodyPreview: document.body.innerText.substring(0, 200),
        pageTitle: document.title,
      };

      // Check for XLR engine
      if (window.xlrPlayer) {
        checks.xlrExists = true;
        checks.xlrState = window.xlrPlayer.getState?.() || 'unknown';
        checks.xlrLayout = window.xlrPlayer.getCurrentLayout?.() || null;
      } else if (window.xlr) {
        checks.xlrExists = true;
        checks.xlrState = 'legacy';
      } else {
        checks.xlrExists = false;
      }

      // Determine if playing
      checks.isPlaying = !checks.isSetupPage &&
                        (checks.hasXlrContainer || checks.bodyTextLength > 200);

      return checks;
    });

    return playbackStatus;
  }

  async runSingleIteration(iteration) {
    const iterationResult = {
      iteration,
      startTime: new Date().toISOString(),
      success: false,
      error: null,
      screenshots: [],
      playbackStatus: null
    };

    try {
      await this.log(`\n${'='.repeat(80)}`);
      await this.log(`ITERATION ${iteration}/${TEST_CONFIG.maxIterations}`);
      await this.log('='.repeat(80));

      // Take screenshot
      iterationResult.screenshots.push(
        await this.takeScreenshot('check', iteration)
      );

      // Check playback status
      const playbackStatus = await this.checkPlaybackStatus(iteration);
      iterationResult.playbackStatus = playbackStatus;

      await this.log(`Playback Check:`);
      await this.log(`  URL: ${playbackStatus.url}`);
      await this.log(`  Setup page: ${playbackStatus.isSetupPage}`);
      await this.log(`  XLR exists: ${playbackStatus.xlrExists}`);
      if (playbackStatus.xlrExists) {
        await this.log(`  XLR state: ${playbackStatus.xlrState}`);
      }
      await this.log(`  Has content: ${playbackStatus.bodyTextLength} chars`);
      await this.log(`  Is playing: ${playbackStatus.isPlaying ? 'YES' : 'NO'}`);

      if (!playbackStatus.isPlaying) {
        throw new Error(`Content is NOT playing! URL: ${playbackStatus.url}`);
      }

      await this.log(`✓ ITERATION ${iteration} PASSED - Content is playing`);
      iterationResult.success = true;

    } catch (error) {
      iterationResult.success = false;
      iterationResult.error = error.message;
      await this.log(`✗ ITERATION ${iteration} FAILED: ${error.message}`, 'ERROR');

      // Take error screenshot
      try {
        iterationResult.screenshots.push(
          await this.takeScreenshot('ERROR', iteration)
        );
      } catch (screenshotError) {
        await this.log(`Could not take error screenshot: ${screenshotError.message}`, 'WARN');
      }
    } finally {
      iterationResult.endTime = new Date().toISOString();
    }

    return iterationResult;
  }

  async run() {
    await this.ensureScreenshotDir();
    await this.log(`Starting exhaustive playback test - ${TEST_CONFIG.maxIterations} iterations`);
    await this.log(`Results will be saved to: ${TEST_CONFIG.resultsFile}`);

    try {
      // ONE-TIME SETUP
      await this.setupBrowserOnce();
      await this.authenticateOnce();

      // CONTINUOUS MONITORING
      for (let i = 1; i <= TEST_CONFIG.maxIterations; i++) {
        const result = await this.runSingleIteration(i);
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

        // Print summary
        await this.printSummary();

        // Wait between checks
        if (i < TEST_CONFIG.maxIterations) {
          const waitSec = TEST_CONFIG.betweenChecks / 1000;
          await this.log(`Waiting ${waitSec}s before next check...\n`);
          await this.page.waitForTimeout(TEST_CONFIG.betweenChecks);
        }
      }

      await this.log('\n' + '='.repeat(80));
      await this.log('EXHAUSTIVE TEST COMPLETE');
      await this.log('='.repeat(80));
      await this.printSummary();
      await this.printDetailedResults();

    } catch (error) {
      await this.log(`FATAL ERROR: ${error.message}`, 'ERROR');
      await this.log(error.stack, 'ERROR');
      throw error;
    } finally {
      // Cleanup
      if (this.page) await this.page.close().catch(() => {});
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }
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
      if (iter.playbackStatus) {
        console.log(`  Playing: ${iter.playbackStatus.isPlaying ? 'YES' : 'NO'}`);
        console.log(`  URL: ${iter.playbackStatus.url}`);
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
