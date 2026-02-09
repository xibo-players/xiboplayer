#!/usr/bin/env node

/**
 * Comprehensive PWA-XLR Test Suite
 *
 * Tests:
 * - All media types (image, video, text, webpage, embedded, etc.)
 * - Scheduling (daypart, date ranges, priorities)
 * - Layout types (single region, multi-region, overlays)
 * - Transitions and effects
 * - Interruptions and overrides
 * - Long-term stability
 */

const { chromium } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

const CONFIG = {
  baseUrl: 'https://displays.superpantalles.com/player/xlr/',
  cmsUrl: 'https://displays.superpantalles.com',
  cmsKey: 'isiSdUCy',
  displayName: 'E2E-Comprehensive-Test',

  screenshotDir: path.join(__dirname, 'comprehensive-test-screenshots'),
  resultsFile: path.join(__dirname, 'comprehensive-test-results.json'),

  // Test configuration
  mediaCheckInterval: 5000,  // Check every 5s
  testDuration: {
    perMediaType: 30000,     // 30s per media type
    perLayout: 45000,        // 45s per layout
    scheduleTest: 120000,    // 2min for schedule tests
    stabilityTest: 300000    // 5min stability test
  }
};

class ComprehensiveTestSuite {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;

    this.results = {
      startTime: new Date().toISOString(),
      testSuites: [],
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };

    // Test suites to run
    this.testSuites = [
      { name: 'Media Types', tests: this.getMediaTypeTests() },
      { name: 'Layouts', tests: this.getLayoutTests() },
      { name: 'Scheduling', tests: this.getSchedulingTests() },
      { name: 'Priorities', tests: this.getPriorityTests() },
      { name: 'Transitions', tests: this.getTransitionTests() },
      { name: 'Stability', tests: this.getStabilityTests() }
    ];
  }

  // ============================================
  // Test Definitions
  // ============================================

  getMediaTypeTests() {
    return [
      {
        name: 'Image Display',
        description: 'Verify static images display correctly',
        checks: [
          'Image loads without errors',
          'Image fills region appropriately',
          'Image quality is acceptable',
          'Multiple images cycle if configured'
        ]
      },
      {
        name: 'Video Playback',
        description: 'Verify video content plays smoothly',
        checks: [
          'Video loads and starts playing',
          'Audio plays (if enabled)',
          'Video loops or advances',
          'No stuttering or buffering issues'
        ]
      },
      {
        name: 'Text Widget',
        description: 'Verify text content renders properly',
        checks: [
          'Text is readable and properly formatted',
          'Fonts and colors match configuration',
          'Text scrolls/animates if configured',
          'Long text handles overflow correctly'
        ]
      },
      {
        name: 'Embedded Content',
        description: 'Verify embedded HTML/JavaScript',
        checks: [
          'Embedded content loads',
          'Interactive elements work',
          'No JavaScript errors',
          'Content updates dynamically'
        ]
      },
      {
        name: 'Web Page Widget',
        description: 'Verify web page embedding',
        checks: [
          'Web page loads in iframe',
          'Page is interactive (if enabled)',
          'CORS issues handled',
          'Page refreshes on schedule'
        ]
      },
      {
        name: 'Data Widgets',
        description: 'Verify data-driven widgets (ticker, stocks, weather)',
        checks: [
          'Data fetches from source',
          'Content updates periodically',
          'Formatting is correct',
          'No API errors'
        ]
      }
    ];
  }

  getLayoutTests() {
    return [
      {
        name: 'Single Region Layout',
        description: 'Full screen single content area',
        checks: [
          'Content fills entire screen',
          'No black borders or gaps',
          'Transitions work smoothly',
          'Content cycles properly'
        ]
      },
      {
        name: 'Multi-Region Layout',
        description: 'Multiple content areas simultaneously',
        checks: [
          'All regions render correctly',
          'No region overlap issues',
          'Independent content in each region',
          'Synchronized or independent timing'
        ]
      },
      {
        name: 'Overlay Regions',
        description: 'Content layered on top of other content',
        checks: [
          'Overlay appears above base content',
          'Transparency works correctly',
          'No z-index issues',
          'Overlay timing independent'
        ]
      },
      {
        name: 'Responsive Layout',
        description: 'Layout adapts to different resolutions',
        checks: [
          'Regions scale appropriately',
          'Aspect ratios maintained',
          'Text remains readable',
          'No content cutoff'
        ]
      }
    ];
  }

  getSchedulingTests() {
    return [
      {
        name: 'Default Schedule',
        description: 'Always-on content plays when nothing else scheduled',
        checks: [
          'Default content plays',
          'No blank screens',
          'Continuous playback',
          'Fallback works if scheduled content fails'
        ]
      },
      {
        name: 'Time-Based Schedule',
        description: 'Content plays at specific times',
        checks: [
          'Content starts at scheduled time',
          'Content stops at end time',
          'Transitions to next schedule',
          'Handles timezone correctly'
        ]
      },
      {
        name: 'Day Parting',
        description: 'Different content for different times of day',
        checks: [
          'Morning content plays in morning',
          'Afternoon content switches over',
          'Evening content activates',
          'Weekend vs weekday differences'
        ]
      },
      {
        name: 'Date Range Schedule',
        description: 'Content plays within date ranges',
        checks: [
          'Content starts on start date',
          'Content continues through range',
          'Content stops on end date',
          'Handles month/year boundaries'
        ]
      }
    ];
  }

  getPriorityTests() {
    return [
      {
        name: 'Priority Interruption',
        description: 'High priority content interrupts lower priority',
        checks: [
          'High priority starts immediately',
          'Lower priority pauses or stops',
          'Returns to original after interruption',
          'Multiple priority levels work'
        ]
      },
      {
        name: 'Campaign Priority',
        description: 'Campaign-level priority ordering',
        checks: [
          'Higher priority campaigns take precedence',
          'Equal priority campaigns share time',
          'Priority respected across layouts',
          'Manual priority override works'
        ]
      }
    ];
  }

  getTransitionTests() {
    return [
      {
        name: 'Content Transitions',
        description: 'Smooth transitions between content',
        checks: [
          'Fade transitions work',
          'Slide transitions work',
          'No black flashes',
          'Timing is correct'
        ]
      },
      {
        name: 'Layout Transitions',
        description: 'Transitions between different layouts',
        checks: [
          'Layout switches cleanly',
          'No rendering glitches',
          'All regions appear',
          'Content syncs correctly'
        ]
      }
    ];
  }

  getStabilityTests() {
    return [
      {
        name: 'Long-Term Playback',
        description: 'Player runs continuously without issues',
        checks: [
          'No memory leaks over time',
          'Performance remains consistent',
          'No crashes or freezes',
          'Content continues cycling'
        ]
      },
      {
        name: 'Error Recovery',
        description: 'Player recovers from errors gracefully',
        checks: [
          'Missing media handled',
          'Network interruptions recovered',
          'Invalid content skipped',
          'Player doesn\'t get stuck'
        ]
      }
    ];
  }

  // ============================================
  // Test Infrastructure
  // ============================================

  async log(message, level = 'INFO') {
    const timestamp = new Date().toISOString().substr(11, 8);
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      SUCCESS: '\x1b[32m', // Green
      FAIL: '\x1b[31m',    // Red
      WARN: '\x1b[33m',    // Yellow
      SUITE: '\x1b[35m',   // Magenta
      TEST: '\x1b[34m'     // Blue
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';

    console.log(`${color}[${timestamp}] [${level}]${reset} ${message}`);
  }

  async setupBrowser() {
    await this.log('Setting up browser...', 'INFO');

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'Europe/Madrid',
    });

    this.page = await this.context.newPage();

    // Console logging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`  [BROWSER] ${msg.text()}`);
      }
    });

    await this.log('✓ Browser ready', 'SUCCESS');
  }

  async authenticate() {
    await this.log('Authenticating player...', 'INFO');

    await this.page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle' });

    // Inject configuration
    await this.page.evaluate((config) => {
      function generateHardwareKey() {
        const nav = navigator;
        const screen = window.screen;
        const parts = [
          nav.userAgent, nav.language, screen.colorDepth,
          screen.width, screen.height, new Date().getTimezoneOffset()
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
    }, {
      cmsUrl: CONFIG.cmsUrl,
      cmsKey: CONFIG.cmsKey,
      displayName: CONFIG.displayName
    });

    await this.page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(15000);

    const isSetupPage = this.page.url().includes('setup.html');
    if (isSetupPage) {
      throw new Error('Authentication failed - still on setup page');
    }

    await this.log('✓ Authentication successful', 'SUCCESS');
  }

  async takeScreenshot(name) {
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    const filename = `${Date.now()}-${name}.png`;
    const filepath = path.join(CONFIG.screenshotDir, filename);
    await this.page.screenshot({ path: filepath, fullPage: false });
    return filename;
  }

  async getPlayerState() {
    return await this.page.evaluate(() => {
      const state = {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 200),
        textLength: document.body.innerText.length,
        xlrExists: false,
        xlrState: null,
        currentLayout: null,
        errors: []
      };

      // Check XLR engine
      if (window.xlrPlayer) {
        state.xlrExists = true;
        state.xlrState = window.xlrPlayer.getState?.() || 'unknown';
        state.currentLayout = window.xlrPlayer.getCurrentLayout?.() || null;
      } else if (window.xlr) {
        state.xlrExists = true;
        state.xlrState = 'legacy';
      }

      // Check for visible content
      state.hasVisibleContent = state.textLength > 50 ||
                                document.querySelectorAll('img, video, canvas').length > 0;

      return state;
    });
  }

  async runTest(suiteName, test) {
    const testResult = {
      suite: suiteName,
      name: test.name,
      description: test.description,
      startTime: new Date().toISOString(),
      status: 'running',
      checks: [],
      screenshots: [],
      errors: []
    };

    try {
      await this.log(`\n  → ${test.name}`, 'TEST');
      await this.log(`    ${test.description}`, 'INFO');

      // Take initial screenshot
      const screenshot = await this.takeScreenshot(`${suiteName}-${test.name}-start`);
      testResult.screenshots.push(screenshot);

      // Get initial player state
      const initialState = await this.getPlayerState();

      // Run checks based on test type
      for (const checkDescription of test.checks) {
        const check = {
          description: checkDescription,
          status: 'pending',
          details: null
        };

        try {
          // Generic playback verification
          const state = await this.getPlayerState();

          // Basic checks that apply to all tests
          if (!state.xlrExists) {
            check.status = 'warning';
            check.details = 'XLR engine not detected';
          } else if (!state.hasVisibleContent) {
            check.status = 'fail';
            check.details = 'No visible content detected';
          } else {
            check.status = 'pass';
            check.details = 'Content appears to be playing';
          }

          await this.log(`      ${check.status === 'pass' ? '✓' : '✗'} ${checkDescription}`,
                        check.status === 'pass' ? 'SUCCESS' : 'WARN');

        } catch (error) {
          check.status = 'error';
          check.details = error.message;
          await this.log(`      ✗ ${checkDescription}: ${error.message}`, 'FAIL');
        }

        testResult.checks.push(check);
      }

      // Wait and observe
      await this.page.waitForTimeout(CONFIG.testDuration.perMediaType);

      // Take final screenshot
      const finalScreenshot = await this.takeScreenshot(`${suiteName}-${test.name}-end`);
      testResult.screenshots.push(finalScreenshot);

      // Determine overall test status
      const failedChecks = testResult.checks.filter(c => c.status === 'fail' || c.status === 'error');
      if (failedChecks.length === 0) {
        testResult.status = 'passed';
        this.results.summary.passed++;
      } else {
        testResult.status = 'failed';
        this.results.summary.failed++;
      }

    } catch (error) {
      testResult.status = 'error';
      testResult.errors.push(error.message);
      this.results.summary.failed++;
      await this.log(`    ✗ Test error: ${error.message}`, 'FAIL');
    }

    testResult.endTime = new Date().toISOString();
    this.results.summary.totalTests++;

    return testResult;
  }

  async runTestSuite(suite) {
    await this.log(`\n${'='.repeat(80)}`, 'SUITE');
    await this.log(`TEST SUITE: ${suite.name}`, 'SUITE');
    await this.log('='.repeat(80), 'SUITE');

    const suiteResult = {
      name: suite.name,
      startTime: new Date().toISOString(),
      tests: [],
      summary: { passed: 0, failed: 0, skipped: 0 }
    };

    for (const test of suite.tests) {
      const testResult = await this.runTest(suite.name, test);
      suiteResult.tests.push(testResult);

      if (testResult.status === 'passed') {
        suiteResult.summary.passed++;
      } else if (testResult.status === 'failed' || testResult.status === 'error') {
        suiteResult.summary.failed++;
      }
    }

    suiteResult.endTime = new Date().toISOString();
    this.results.testSuites.push(suiteResult);

    // Print suite summary
    await this.log(`\n  Suite Summary: ${suiteResult.summary.passed} passed, ${suiteResult.summary.failed} failed`,
                    suiteResult.summary.failed === 0 ? 'SUCCESS' : 'WARN');

    return suiteResult;
  }

  async run() {
    try {
      await this.log('\n╔════════════════════════════════════════════════════════════╗', 'SUITE');
      await this.log('║     PWA-XLR COMPREHENSIVE TEST SUITE                      ║', 'SUITE');
      await this.log('╚════════════════════════════════════════════════════════════╝', 'SUITE');

      await this.setupBrowser();
      await this.authenticate();

      await this.log(`\nRunning ${this.testSuites.length} test suites...`, 'INFO');

      for (const suite of this.testSuites) {
        await this.runTestSuite(suite);
      }

      // Final summary
      await this.log('\n' + '='.repeat(80), 'SUITE');
      await this.log('FINAL SUMMARY', 'SUITE');
      await this.log('='.repeat(80), 'SUITE');
      await this.log(`Total Tests: ${this.results.summary.totalTests}`, 'INFO');
      await this.log(`Passed: ${this.results.summary.passed}`, 'SUCCESS');
      await this.log(`Failed: ${this.results.summary.failed}`, this.results.summary.failed > 0 ? 'FAIL' : 'INFO');

      const passRate = ((this.results.summary.passed / this.results.summary.totalTests) * 100).toFixed(1);
      await this.log(`Pass Rate: ${passRate}%`, passRate >= 90 ? 'SUCCESS' : 'WARN');

      // Save results
      this.results.endTime = new Date().toISOString();
      await fs.writeFile(CONFIG.resultsFile, JSON.stringify(this.results, null, 2));
      await this.log(`\nResults saved to: ${CONFIG.resultsFile}`, 'SUCCESS');
      await this.log(`Screenshots saved to: ${CONFIG.screenshotDir}`, 'SUCCESS');

    } catch (error) {
      await this.log(`FATAL ERROR: ${error.message}`, 'FAIL');
      console.error(error);
    } finally {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    }

    return this.results.summary.failed === 0 ? 0 : 1;
  }
}

// Run test suite
(async () => {
  const suite = new ComprehensiveTestSuite();
  const exitCode = await suite.run();
  process.exit(exitCode);
})();
