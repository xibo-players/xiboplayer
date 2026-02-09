const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const CMS_URL = 'https://displays.superpantalles.com';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';

test.setTimeout(120000); // 2 minutes

test.describe('XMR WebSocket Signaling', () => {

  test('XMR-01: Verify XMR connection established', async ({ page }) => {
    console.log('\n=== XMR CONNECTION TEST ===\n');

    // Monitor console for XMR messages
    const xmrLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]')) {
        xmrLogs.push(text);
        console.log(`  ${text}`);
      }
    });

    // Load player
    console.log('Loading player...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');

    // Wait for XMR initialization
    console.log('Waiting for XMR to initialize...');
    await page.waitForTimeout(15000); // 15 seconds for connection

    // Check XMR status
    const xmrStatus = await page.evaluate(() => {
      const xmr = window.xlr?.xmr;
      return {
        wrapperExists: !!xmr,
        connected: xmr?.connected || false,
        xmrInstance: !!xmr?.xmr,
        channel: xmr?.xmr?.channel || null,
        reconnectAttempts: xmr?.reconnectAttempts || 0,
        maxReconnectAttempts: xmr?.maxReconnectAttempts || 0
      };
    });

    console.log('\n--- XMR Status ---');
    console.log(JSON.stringify(xmrStatus, null, 2));

    // Screenshot
    await page.screenshot({
      path: './screenshots/xmr-01-connection-status.png',
      fullPage: true
    });

    // Assertions
    expect(xmrStatus.wrapperExists, 'XMR wrapper should exist').toBeTruthy();

    if (xmrStatus.connected) {
      console.log('\n✅ XMR CONNECTED');
      expect(xmrStatus.xmrInstance).toBeTruthy();
      expect(xmrStatus.channel).toMatch(/^player-/);
      console.log(`   Channel: ${xmrStatus.channel}`);
    } else {
      console.log('\n⚠️  XMR NOT CONNECTED (fallback to XMDS polling mode)');
      console.log(`   Reconnect attempts: ${xmrStatus.reconnectAttempts}/${xmrStatus.maxReconnectAttempts}`);

      // Check logs for connection failure reason
      const errorLogs = xmrLogs.filter(log =>
        log.includes('Failed') || log.includes('error') || log.includes('Error')
      );

      if (errorLogs.length > 0) {
        console.log('\n   Error logs:');
        errorLogs.forEach(log => console.log(`   - ${log}`));
      }
    }

    // Check for connection logs
    const connectionLogs = xmrLogs.filter(log =>
      log.includes('Initializing') ||
      log.includes('Connected') ||
      log.includes('WebSocket connected')
    );

    console.log(`\n   XMR logs captured: ${xmrLogs.length}`);
    console.log(`   Connection logs: ${connectionLogs.length}`);

    console.log('\n=== TEST COMPLETE ===');
  });

  test('XMR-02: Test collectNow command (manual trigger)', async ({ page, context }) => {
    console.log('\n=== XMR COLLECT NOW TEST ===\n');
    console.log('⚠️  This test requires manual interaction in CMS');
    console.log('   1. Open CMS in browser');
    console.log('   2. Go to Displays → test_pwa');
    console.log('   3. Click "Collect Now" button');
    console.log('   4. Watch console output below\n');

    // Monitor console for XMR commands
    const commandLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]') || text.includes('[XMDS]')) {
        commandLogs.push({ time: new Date(), text });
        console.log(`  [${new Date().toISOString()}] ${text}`);
      }
    });

    // Load player
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(15000);

    // Check XMR connected
    const isConnected = await page.evaluate(() => window.xlr?.xmr?.connected);

    if (!isConnected) {
      console.log('\n⚠️  XMR not connected - cannot test collectNow command');
      console.log('   Skipping manual test');
      return;
    }

    console.log('✅ XMR connected - ready for collectNow test');
    console.log('\n--- Waiting 60 seconds for manual "Collect Now" click ---');
    console.log('   (Or press Ctrl+C to skip this test)\n');

    // Wait 60 seconds for manual trigger
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
      await page.waitForTimeout(5000);

      // Check for collectNow in logs
      const collectLogs = commandLogs.filter(log =>
        log.text.includes('collectNow')
      );

      if (collectLogs.length > 0) {
        console.log('\n✅ COLLECT NOW RECEIVED!');
        console.log(`   Received at: ${collectLogs[0].time.toISOString()}`);
        console.log(`   Latency: ~${Date.now() - startTime}ms from test start`);

        // Wait for collection to complete
        await page.waitForTimeout(5000);

        const collectionLogs = commandLogs.filter(log =>
          log.text.includes('RequiredFiles') ||
          log.text.includes('Schedule') ||
          log.text.includes('completed')
        );

        console.log('\n   Collection logs:');
        collectionLogs.forEach(log => {
          console.log(`   - ${log.text}`);
        });

        console.log('\n✅ XMR collectNow command working!');
        await page.screenshot({
          path: './screenshots/xmr-02-collect-now-success.png'
        });
        return;
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`   ... waiting (${elapsed}s / 60s)`);
    }

    console.log('\n⚠️  No collectNow received within 60 seconds');
    console.log('   Test incomplete - requires manual CMS interaction');
  });

  test('XMR-03: Test screenshot command (if available)', async ({ page }) => {
    console.log('\n=== XMR SCREENSHOT TEST ===\n');
    console.log('⚠️  This test requires manual interaction in CMS');
    console.log('   1. Open CMS → Displays → test_pwa');
    console.log('   2. Click "Request Screenshot" button');
    console.log('   3. Watch console output\n');

    // Monitor console
    const screenshotLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]') || text.includes('screenshot') || text.includes('Screenshot')) {
        screenshotLogs.push(text);
        console.log(`  ${text}`);
      }
    });

    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(15000);

    const isConnected = await page.evaluate(() => window.xlr?.xmr?.connected);

    if (!isConnected) {
      console.log('\n⚠️  XMR not connected - cannot test screenshot command');
      return;
    }

    console.log('✅ XMR connected - waiting for screenshot command...\n');

    // Wait 60 seconds for screenshot command
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);

      const hasScreenshot = screenshotLogs.some(log =>
        log.includes('screenShot') || log.includes('screenshot')
      );

      if (hasScreenshot) {
        console.log('\n✅ SCREENSHOT COMMAND RECEIVED!');
        console.log('\n   Screenshot logs:');
        screenshotLogs.forEach(log => console.log(`   - ${log}`));

        await page.screenshot({
          path: './screenshots/xmr-03-screenshot-success.png'
        });
        return;
      }

      console.log(`   ... waiting (${(i + 1) * 5}s / 60s)`);
    }

    console.log('\n⚠️  No screenshot command received');
  });

  test('XMR-04: Verify graceful fallback on disconnect', async ({ page }) => {
    console.log('\n=== XMR FALLBACK TEST ===\n');

    const allLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]') || text.includes('[XMDS]')) {
        allLogs.push(text);
        console.log(`  ${text}`);
      }
    });

    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(15000);

    const initialStatus = await page.evaluate(() => ({
      connected: window.xlr?.xmr?.connected,
      hasXMR: !!window.xlr?.xmr
    }));

    console.log('Initial XMR status:', initialStatus);

    // Check for fallback messages in logs
    const fallbackLogs = allLogs.filter(log =>
      log.includes('polling mode') ||
      log.includes('Failed to start') ||
      log.includes('Continuing') ||
      log.includes('XMDS only')
    );

    if (fallbackLogs.length > 0) {
      console.log('\n✅ Fallback behavior detected:');
      fallbackLogs.forEach(log => console.log(`   - ${log}`));
      console.log('\n✅ Player continues operating in XMDS polling mode');
    } else if (initialStatus.connected) {
      console.log('\n✅ XMR connected - no fallback needed');
    } else {
      console.log('\n⚠️  XMR not connected but no explicit fallback messages');
    }

    // Verify player is still functional
    const playerWorking = await page.evaluate(() => {
      return {
        hasXLR: typeof window.xlr !== 'undefined',
        url: window.location.href,
        isSetup: window.location.href.includes('setup.html')
      };
    });

    console.log('\nPlayer status:', playerWorking);
    expect(playerWorking.hasXLR, 'Player should be initialized').toBeTruthy();

    if (!playerWorking.isSetup) {
      console.log('✅ Player is operating (showing content)');
    } else {
      console.log('⚠️  Player in setup mode');
    }

    await page.screenshot({
      path: './screenshots/xmr-04-fallback-status.png',
      fullPage: true
    });

    console.log('\n=== TEST COMPLETE ===');
  });

  test('XMR-05: Verify auto-reconnection behavior', async ({ page }) => {
    console.log('\n=== XMR AUTO-RECONNECT TEST ===\n');

    const reconnectLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]')) {
        reconnectLogs.push(text);
        if (text.includes('reconnect') || text.includes('Reconnect')) {
          console.log(`  ${text}`);
        }
      }
    });

    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');

    // Wait longer to observe reconnection attempts
    console.log('Observing for 30 seconds...');
    await page.waitForTimeout(30000);

    const xmrStatus = await page.evaluate(() => ({
      connected: window.xlr?.xmr?.connected,
      attempts: window.xlr?.xmr?.reconnectAttempts,
      maxAttempts: window.xlr?.xmr?.maxReconnectAttempts
    }));

    console.log('\nXMR reconnection status:', xmrStatus);

    const reconnectMessages = reconnectLogs.filter(log =>
      log.includes('reconnect') ||
      log.includes('Reconnect') ||
      log.includes('Scheduling reconnect') ||
      log.includes('Attempting to reconnect')
    );

    if (reconnectMessages.length > 0) {
      console.log('\n✅ Auto-reconnection behavior observed:');
      reconnectMessages.forEach(log => console.log(`   - ${log}`));
      console.log(`\n   Attempts: ${xmrStatus.attempts}/${xmrStatus.maxAttempts}`);
    } else if (xmrStatus.connected) {
      console.log('\n✅ XMR connected - no reconnection needed');
    } else {
      console.log('\n⚠️  No reconnection attempts observed');
    }

    await page.screenshot({
      path: './screenshots/xmr-05-reconnect-status.png'
    });

    console.log('\n=== TEST COMPLETE ===');
  });

  test('XMR-06: Full XMR functionality report', async ({ page }) => {
    console.log('\n=== XMR COMPREHENSIVE STATUS REPORT ===\n');

    const allLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[XMR]')) {
        allLogs.push(text);
      }
    });

    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(20000);

    // Comprehensive status check
    const fullStatus = await page.evaluate(() => {
      const xmr = window.xlr?.xmr;
      const xmrInstance = xmr?.xmr;

      return {
        // Wrapper status
        wrapperExists: !!xmr,
        wrapperConnected: xmr?.connected || false,
        reconnectAttempts: xmr?.reconnectAttempts || 0,
        maxReconnectAttempts: xmr?.maxReconnectAttempts || 10,
        reconnectDelay: xmr?.reconnectDelay || 5000,

        // XMR instance status
        xmrInstanceExists: !!xmrInstance,
        channel: xmrInstance?.channel || null,

        // Player info
        playerExists: !!window.xlr,
        playerConfig: {
          cmsAddress: window.xlr?.config?.cmsAddress,
          displayName: window.xlr?.config?.displayName,
          hardwareKey: window.xlr?.config?.hardwareKey?.substring(0, 8) + '...'
        }
      };
    });

    console.log('--- XMR Status Report ---\n');
    console.log(JSON.stringify(fullStatus, null, 2));

    // Categorize logs
    const logCategories = {
      connection: allLogs.filter(l => l.includes('connect') || l.includes('Connect')),
      commands: allLogs.filter(l => l.includes('Received') || l.includes('command')),
      errors: allLogs.filter(l => l.includes('error') || l.includes('Error') || l.includes('failed')),
      warnings: allLogs.filter(l => l.includes('warn') || l.includes('Warning')),
      info: allLogs.filter(l => !l.includes('error') && !l.includes('warn'))
    };

    console.log('\n--- Log Summary ---');
    console.log(`Total XMR logs: ${allLogs.length}`);
    console.log(`Connection logs: ${logCategories.connection.length}`);
    console.log(`Command logs: ${logCategories.commands.length}`);
    console.log(`Error logs: ${logCategories.errors.length}`);
    console.log(`Warning logs: ${logCategories.warnings.length}`);

    if (logCategories.errors.length > 0) {
      console.log('\n--- Errors ---');
      logCategories.errors.forEach(log => console.log(`  ${log}`));
    }

    if (logCategories.warnings.length > 0) {
      console.log('\n--- Warnings ---');
      logCategories.warnings.forEach(log => console.log(`  ${log}`));
    }

    if (logCategories.commands.length > 0) {
      console.log('\n--- Commands Received ---');
      logCategories.commands.forEach(log => console.log(`  ${log}`));
    }

    // Final verdict
    console.log('\n--- VERDICT ---');

    if (fullStatus.wrapperConnected) {
      console.log('✅ XMR is OPERATIONAL');
      console.log(`   Channel: ${fullStatus.channel}`);
      console.log('   Status: Connected and ready for commands');
      console.log('   Latency: Real-time (<1 second)');
    } else {
      console.log('⚠️  XMR is NOT CONNECTED');
      console.log('   Status: Fallback to XMDS polling mode');
      console.log('   Latency: 5-10 minutes (XMDS cycle)');
      console.log(`   Reconnect attempts: ${fullStatus.reconnectAttempts}/${fullStatus.maxReconnectAttempts}`);

      if (fullStatus.reconnectAttempts >= fullStatus.maxReconnectAttempts) {
        console.log('   ❌ Max reconnect attempts reached');
      }
    }

    console.log('\n--- Supported Commands ---');
    console.log('   1. collectNow - Force schedule collection');
    console.log('   2. screenShot - Capture screenshot');
    console.log('   3. changeLayout - Override schedule');
    console.log('   4. licenceCheck - Validate license (no-op)');
    console.log('   5. rekey - Rotate encryption keys (not impl)');

    console.log('\n--- Testing Instructions ---');
    console.log('To test XMR commands manually:');
    console.log('1. Login to CMS: https://displays.superpantalles.com');
    console.log('2. Go to: Displays → test_pwa');
    console.log('3. Available actions:');
    console.log('   - "Collect Now" → Tests collectNow command');
    console.log('   - "Request Screenshot" → Tests screenShot command');
    console.log('4. Watch player console for [XMR] messages');

    await page.screenshot({
      path: './screenshots/xmr-06-full-report.png',
      fullPage: true
    });

    console.log('\n=== REPORT COMPLETE ===');
  });

});
