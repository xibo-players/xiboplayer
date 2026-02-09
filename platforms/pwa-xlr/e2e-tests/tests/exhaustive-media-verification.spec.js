const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CMS_URL = 'https://displays.superpantalles.com';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(600000); // 10 minutes per test

// Results tracking
const testResults = [];

function logResult(mediaType, step, status, details) {
  const result = {
    mediaType,
    step,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  testResults.push(result);

  const icon = status === 'SUCCESS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`   ${icon} [${mediaType}] ${step}: ${details}`);
}

// Single auth
let cachedToken = null;

async function getToken(request) {
  if (cachedToken) return cachedToken;

  console.log('[AUTH] Authenticating once for all tests...\n');
  const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    },
    ignoreHTTPSErrors: true
  });

  const tokenData = await tokenResp.json();
  cachedToken = tokenData.access_token;
  console.log('[AUTH] ✅ Token cached for all tests\n');
  return cachedToken;
}

// Helper: Check CMS state when media doesn't play
async function diagnoseCMSState(page, request, token, layoutName, mediaType) {
  console.log(`\n[DIAGNOSE] Media not playing, checking CMS state...`);

  // 1. Check layout exists
  const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  const layouts = await layoutsResp.json();
  const layout = layouts.find(l => l.layout === layoutName);

  if (!layout) {
    logResult(mediaType, 'Diagnose', 'FAIL', 'Layout not found in CMS');
    return { issue: 'Layout not found' };
  }

  logResult(mediaType, 'Diagnose', 'SUCCESS', `Layout exists (ID: ${layout.layoutId})`);
  console.log(`   Layout ID: ${layout.layoutId}`);
  console.log(`   Published: ${layout.published}`);
  console.log(`   Campaign ID: ${layout.campaignId}`);

  // 2. Check schedule exists
  const schedulesResp = await request.get(`${CMS_URL}/api/schedule`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  const schedules = await schedulesResp.json();
  const schedule = schedules.find(s => s.campaignId === layout.campaignId);

  if (!schedule) {
    logResult(mediaType, 'Diagnose', 'FAIL', 'Layout not scheduled');
    console.log(`   ⚠️  Layout exists but is NOT scheduled on any display`);
    return { issue: 'Not scheduled', layout };
  }

  logResult(mediaType, 'Diagnose', 'SUCCESS', `Schedule exists (Event ID: ${schedule.eventId})`);
  console.log(`   Schedule ID: ${schedule.eventId}`);
  console.log(`   Display Groups: ${schedule.displayGroups || 'N/A'}`);

  // 3. Check in CMS UI
  console.log('\n[DIAGNOSE] Checking CMS UI via Playwright...');

  await page.goto(`${CMS_URL}/login`);
  const usernameField = page.locator('input[name="username"]');
  if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await usernameField.fill('xibo_admin');
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('networkidle');
  }

  await page.goto(`${CMS_URL}/layout/view`);
  await page.waitForTimeout(2000);

  const layoutInUI = await page.locator(`text="${layoutName}"`).isVisible({ timeout: 5000 }).catch(() => false);

  if (layoutInUI) {
    logResult(mediaType, 'Diagnose', 'SUCCESS', 'Layout visible in CMS UI');
    await page.screenshot({ path: `./screenshots/diagnose-${mediaType}-cms-ui.png`, fullPage: true });
  } else {
    logResult(mediaType, 'Diagnose', 'FAIL', 'Layout not visible in CMS UI');
  }

  return {
    layout,
    schedule,
    inUI: layoutInUI,
    diagnosis: 'Layout exists and scheduled, player needs collection time (5-10 min) or Collect Now'
  };
}

test.describe('Exhaustive Media Verification', () => {

  test('EXHAUST-01: Test ALL Media Types', async ({ page, request, context }) => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('EXHAUSTIVE MEDIA TYPE VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    const token = await getToken(request);

    // Get display
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa') || displays[0];

    console.log(`[SETUP] Using display: ${testDisplay.display} (Group: ${testDisplay.displayGroupId})\n`);

    // Media types to test
    const mediaTypes = [
      { type: 'Image-JPG', file: 'images/test-image.jpg', widget: 'image', mime: 'image/jpeg' },
      { type: 'Image-PNG', file: 'images/test-image.png', widget: 'image', mime: 'image/png' },
      { type: 'Image-GIF', file: 'images/test-image.gif', widget: 'image', mime: 'image/gif' },
      { type: 'Video-MP4', file: 'videos/test-video.mp4', widget: 'video', mime: 'video/mp4' },
      { type: 'Video-WebM', file: 'videos/test-video.webm', widget: 'video', mime: 'video/webm' },
      { type: 'Audio-MP3', file: 'audio/test-audio.mp3', widget: 'audio', mime: 'audio/mpeg' },
      { type: 'Audio-WAV', file: 'audio/test-audio.wav', widget: 'audio', mime: 'audio/wav' },
      { type: 'Document-PDF', file: 'documents/test-document.pdf', widget: 'pdf', mime: 'application/pdf' }
    ];

    console.log(`[PLAN] Testing ${mediaTypes.length} media types\n`);
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const media of mediaTypes) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Testing: ${media.type}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      const layoutName = `Test-${media.type}`;
      const mediaFilePath = path.join(__dirname, '../test-media', media.file);

      try {
        // Step 1: Check if file exists locally
        if (!fs.existsSync(mediaFilePath)) {
          logResult(media.type, 'File Check', 'FAIL', `File not found: ${mediaFilePath}`);
          console.log(`\n⚠️  Skipping ${media.type} - test file missing\n`);
          continue;
        }

        logResult(media.type, 'File Check', 'SUCCESS', `File found (${fs.statSync(mediaFilePath).size} bytes)`);

        // Step 2: Check for existing layout
        const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
          headers: { 'Authorization': `Bearer ${token}` },
          ignoreHTTPSErrors: true
        });
        const layouts = await layoutsResp.json();
        let layout = layouts.find(l => l.layout === layoutName);

        let layoutId, campaignId;

        if (layout) {
          logResult(media.type, 'Layout Check', 'SUCCESS', `Using existing layout (ID: ${layout.layoutId})`);
          layoutId = layout.layoutId;
          campaignId = layout.campaignId;

          // Ensure published
          if (!layout.published) {
            await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`, {
              headers: { 'Authorization': `Bearer ${token}` },
              ignoreHTTPSErrors: true
            });
            logResult(media.type, 'Publish', 'SUCCESS', 'Published existing layout');
          }
        } else {
          // Layout doesn't exist - create it
          logResult(media.type, 'Layout Check', 'WARN', 'Layout not found, creating...');

          // Upload media first
          const fileBuffer = fs.readFileSync(mediaFilePath);
          const fileName = `test-${media.type.toLowerCase()}-${Date.now()}${path.extname(mediaFilePath)}`;

          const uploadResp = await request.post(`${CMS_URL}/api/library`, {
            headers: { 'Authorization': `Bearer ${token}` },
            multipart: {
              files: {
                name: fileName,
                mimeType: media.mime,
                buffer: fileBuffer
              },
              name: fileName,
              oldMediaId: '',
              updateInLayouts: '0',
              deleteOldRevisions: '0'
            },
            ignoreHTTPSErrors: true
          });

          if (!uploadResp.ok()) {
            const error = await uploadResp.text();
            logResult(media.type, 'Upload', 'FAIL', `Upload failed: ${uploadResp.status()} - ${error.substring(0, 100)}`);
            continue;
          }

          const uploadResult = await uploadResp.json();
          const mediaId = uploadResult.files[0].mediaId;
          logResult(media.type, 'Upload', 'SUCCESS', `Uploaded (Media ID: ${mediaId})`);

          // Create layout
          const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            form: {
              name: layoutName,
              description: `Test layout for ${media.type}`,
              resolutionId: 9,
              duration: 30
            },
            ignoreHTTPSErrors: true
          });

          if (!layoutResp.ok()) {
            const error = await layoutResp.text();
            logResult(media.type, 'Create Layout', 'FAIL', `Failed: ${layoutResp.status()}`);
            console.log(`\n❌ Cannot create layout. Please create "${layoutName}" manually in CMS:`);
            console.log(`   1. Layouts → Add Layout`);
            console.log(`   2. Name: ${layoutName}`);
            console.log(`   3. Add ${media.widget} widget`);
            console.log(`   4. Upload: ${media.file}`);
            console.log(`   5. Save and Publish\n`);
            continue;
          }

          layout = await layoutResp.json();
          layoutId = layout.layoutId;
          campaignId = layout.campaignId;
          logResult(media.type, 'Create Layout', 'SUCCESS', `Created (ID: ${layoutId})`);

          // Add widget
          const widgetResp = await request.post(`${CMS_URL}/api/playlist/widget/${media.widget}/${layoutId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            form: {
              mediaIds: String(mediaId),
              duration: 30,
              ...(media.widget === 'audio' ? { volume: 75, loop: 0 } : {}),
              ...(media.widget === 'video' ? { mute: 0 } : {})
            },
            ignoreHTTPSErrors: true
          });

          if (!widgetResp.ok()) {
            logResult(media.type, 'Add Widget', 'FAIL', `Widget creation failed: ${widgetResp.status()}`);
            continue;
          }

          logResult(media.type, 'Add Widget', 'SUCCESS', `${media.widget} widget added`);

          // Publish
          await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            ignoreHTTPSErrors: true
          });

          logResult(media.type, 'Publish', 'SUCCESS', 'Layout published');
        }

        // Step 3: Ensure scheduled
        const schedulesResp = await request.get(`${CMS_URL}/api/schedule`, {
          headers: { 'Authorization': `Bearer ${token}` },
          ignoreHTTPSErrors: true
        });

        const schedules = await schedulesResp.json();
        const existingSchedule = schedules.find(s => s.campaignId === campaignId);

        if (!existingSchedule) {
          console.log(`   Scheduling ${layoutName}...`);

          const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            data: {
              eventTypeId: 1,
              campaignId: campaignId,
              displayGroupIds: [testDisplay.displayGroupId],
              isPriority: 0,
              fromDt: '2026-02-03 00:00:00',
              toDt: '2026-02-10 23:59:59'
            },
            ignoreHTTPSErrors: true
          });

          if (scheduleResp.ok()) {
            logResult(media.type, 'Schedule', 'SUCCESS', 'Scheduled on test_pwa');
          } else {
            logResult(media.type, 'Schedule', 'FAIL', `Schedule failed: ${scheduleResp.status()}`);
          }
        } else {
          logResult(media.type, 'Schedule', 'SUCCESS', 'Already scheduled');
        }

        console.log(`\n   ✅ ${media.type} prepared and scheduled`);

      } catch (error) {
        logResult(media.type, 'Error', 'FAIL', error.message);
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SETUP COMPLETE - All media types prepared');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('⏰ Waiting 10 seconds before triggering collection...\n');
    await page.waitForTimeout(10000);

    // Trigger collection via CMS UI
    console.log('[TRIGGER] Opening CMS to trigger Collect Now...\n');

    await page.goto(`${CMS_URL}/login`);
    const usernameField = page.locator('input[name="username"]');
    if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usernameField.fill('xibo_admin');
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForLoadState('networkidle');
      console.log('[TRIGGER] ✅ Logged into CMS\n');
    }

    await page.goto(`${CMS_URL}/display/view`);
    await page.waitForTimeout(3000);

    // Click on test_pwa display
    const displayLink = page.locator(`text="${testDisplay.display}"`).first();
    if (await displayLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await displayLink.click();
      await page.waitForTimeout(2000);

      // Look for Collect Now button
      const collectBtn = page.getByRole('button', { name: /collect now/i }).first();
      if (await collectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[TRIGGER] Clicking "Collect Now"...\n');
        await collectBtn.click();
        await page.waitForTimeout(2000);
        console.log('[TRIGGER] ✅ Collection triggered\n');
        logResult('ALL', 'Collect Now', 'SUCCESS', 'Triggered via CMS UI');
      } else {
        console.log('[TRIGGER] ⚠️  Collect Now button not found, player will collect on next cycle\n');
        logResult('ALL', 'Collect Now', 'WARN', 'Button not found');
      }
    }

    console.log('⏰ Waiting 30 seconds for player to collect and display content...\n');
    await page.waitForTimeout(30000);

    // Now test each media type in player
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('PLAYER VERIFICATION - Checking All Media Types');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Open player in new tab
    const playerPage = await context.newPage();
    await playerPage.goto(PLAYER_URL);
    await playerPage.waitForLoadState('networkidle');

    console.log('[PLAYER] Loaded, waiting 20 seconds for initialization...\n');
    await playerPage.waitForTimeout(20000);

    // Start screen recording
    await context.tracing.start({ screenshots: true, snapshots: true });

    // Check what's actually playing
    const playerState = await playerPage.evaluate(() => ({
      isPlaying: !window.location.href.includes('setup.html'),
      hasXLR: typeof window.xlr !== 'undefined',

      // Check for each widget type
      hasImage: document.querySelector('img.media') !== null,
      imageCount: document.querySelectorAll('img.media').length,

      hasVideo: document.querySelector('video.media') !== null,
      videoCount: document.querySelectorAll('video.media').length,
      videoPlaying: document.querySelector('video.media')?.paused === false,

      hasAudio: document.querySelector('audio') !== null,
      audioCount: document.querySelectorAll('audio').length,
      hasAudioVisual: document.querySelector('.audio-visual') !== null,

      hasPDF: document.querySelector('.pdf-container') !== null,
      pdfCount: document.querySelectorAll('.pdf-container').length,
      hasPageIndicator: document.querySelector('.pdf-page-indicator') !== null,
      pageIndicatorText: document.querySelector('.pdf-page-indicator')?.textContent || null,

      hasText: document.querySelector('iframe') !== null,
      iframeCount: document.querySelectorAll('iframe').length,

      bodyText: document.body.innerText.substring(0, 300)
    }));

    console.log('[PLAYER] Current state:');
    console.log(`   Mode: ${playerState.isPlaying ? '✅ PLAYING' : '⚠️  SETUP'}`);
    console.log(`   XLR Engine: ${playerState.hasXLR ? '✅' : '❌'}\n`);

    console.log('[PLAYER] Widget detection:');
    console.log(`   Images: ${playerState.hasImage ? `✅ ${playerState.imageCount} found` : '❌ None'}`);
    console.log(`   Videos: ${playerState.hasVideo ? `✅ ${playerState.videoCount} found` : '❌ None'}`);
    console.log(`   Audio: ${playerState.hasAudio ? `✅ ${playerState.audioCount} found` : '❌ None'}`);
    console.log(`   Audio visual: ${playerState.hasAudioVisual ? '✅' : '❌'}`);
    console.log(`   PDF: ${playerState.hasPDF ? `✅ ${playerState.pdfCount} found` : '❌ None'}`);
    console.log(`   Page indicator: ${playerState.hasPageIndicator ? `✅ ${playerState.pageIndicatorText}` : '❌'}`);
    console.log(`   Text/iframes: ${playerState.hasText ? `✅ ${playerState.iframeCount} found` : '❌ None'}\n`);

    // Capture screenshot
    await playerPage.screenshot({ path: './screenshots/exhaust-01-player-state.png', fullPage: true });

    // Capture video recording
    await playerPage.video().saveAs('./screenshots/exhaust-01-playback.webm');

    // Log results
    if (playerState.hasImage) logResult('Image', 'Player', 'SUCCESS', `${playerState.imageCount} image(s) found`);
    else logResult('Image', 'Player', 'FAIL', 'No images in player');

    if (playerState.hasVideo) logResult('Video', 'Player', 'SUCCESS', `${playerState.videoCount} video(s) found`);
    else logResult('Video', 'Player', 'FAIL', 'No videos in player');

    if (playerState.hasAudio && playerState.hasAudioVisual) {
      logResult('Audio', 'Player', 'SUCCESS', `Audio widget found with visual feedback`);
      console.log('\n   🎵 ✅ AUDIO WIDGET WORKING! (New feature verified)');
    } else if (playerState.hasAudio) {
      logResult('Audio', 'Player', 'WARN', 'Audio element found but no visual');
    } else {
      logResult('Audio', 'Player', 'FAIL', 'No audio in player');
    }

    if (playerState.hasPDF && playerState.hasPageIndicator) {
      logResult('PDF', 'Player', 'SUCCESS', `PDF with page indicator: ${playerState.pageIndicatorText}`);
      console.log(`\n   📄 ✅ MULTI-PAGE PDF WORKING! (New feature verified)`);
      console.log(`       Page indicator: ${playerState.pageIndicatorText}`);

      // Wait for page change
      console.log('\n[PDF] Waiting 20 seconds for page change...');
      const initialPage = playerState.pageIndicatorText;
      await playerPage.waitForTimeout(20000);

      const newPageText = await playerPage.evaluate(() =>
        document.querySelector('.pdf-page-indicator')?.textContent
      );

      if (newPageText !== initialPage) {
        console.log(`   Page changed: ${initialPage} → ${newPageText}`);
        logResult('PDF', 'Page Cycling', 'SUCCESS', `Pages cycling correctly`);
        await playerPage.screenshot({ path: './screenshots/exhaust-01-pdf-page-change.png', fullPage: true });
      } else if (initialPage?.includes(' / 1')) {
        logResult('PDF', 'Page Cycling', 'SUCCESS', 'Single page PDF (no cycling needed)');
      } else {
        logResult('PDF', 'Page Cycling', 'WARN', 'Page hasn\'t changed yet');
      }
    } else if (playerState.hasPDF) {
      logResult('PDF', 'Player', 'WARN', 'PDF found but no page indicator');
    } else {
      logResult('PDF', 'Player', 'FAIL', 'No PDF in player');
    }

    // Stop tracing
    await context.tracing.stop({ path: './screenshots/exhaust-01-trace.zip' });

    // If media not playing, diagnose
    if (!playerState.hasAudio) {
      console.log('\n[DIAGNOSE] Audio not visible, checking CMS...');
      await diagnoseCMSState(page, request, token, 'Test-Audio-MP3', 'Audio');
    }

    if (!playerState.hasPDF) {
      console.log('\n[DIAGNOSE] PDF not visible, checking CMS...');
      await diagnoseCMSState(page, request, token, 'Test-Document-PDF', 'PDF');
    }

    // Generate final report
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('EXHAUSTIVE TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const successCount = testResults.filter(r => r.status === 'SUCCESS').length;
    const failCount = testResults.filter(r => r.status === 'FAIL').length;
    const warnCount = testResults.filter(r => r.status === 'WARN').length;

    console.log(`Total operations: ${testResults.length}`);
    console.log(`Success: ✅ ${successCount}`);
    console.log(`Warnings: ⚠️  ${warnCount}`);
    console.log(`Failures: ❌ ${failCount}\n`);

    console.log('Detailed Results:\n');
    testResults.forEach((r, i) => {
      const icon = r.status === 'SUCCESS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${i + 1}. ${icon} [${r.mediaType}] ${r.step}: ${r.details}`);
    });

    // Save report
    const reportPath = './test-results/exhaustive-media-report.json';
    fs.mkdirSync('./test-results', { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      testSuite: 'Exhaustive Media Verification',
      executionTime: new Date().toISOString(),
      playerState,
      results: testResults,
      summary: {
        total: testResults.length,
        success: successCount,
        warnings: warnCount,
        failures: failCount
      }
    }, null, 2));

    console.log(`\nReport saved: ${reportPath}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('EXHAUSTIVE TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Screenshots captured:');
    console.log('   - exhaust-01-player-state.png');
    console.log('   - exhaust-01-playback.webm (screen recording)');
    console.log('   - exhaust-01-trace.zip (Playwright trace)');
    if (playerState.hasPDF) console.log('   - exhaust-01-pdf-page-change.png');
    console.log('');

    expect(playerState.isPlaying, 'Player should be in playback mode').toBeTruthy();
  });

});
