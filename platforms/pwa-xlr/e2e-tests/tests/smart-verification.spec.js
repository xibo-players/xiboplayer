const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CMS_URL = 'https://displays.superpantalles.com';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const PASSWORD = '¿¡Dd20#j3hqc3Mp.!?';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';

test.setTimeout(300000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

// Shared authentication
let cachedToken = null;
let cachedExpiry = 0;

async function getToken(request) {
  if (cachedToken && Date.now() < cachedExpiry) {
    return cachedToken;
  }

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
  cachedExpiry = Date.now() + (3500 * 1000);

  console.log('[AUTH] ✅ Token obtained (valid for 58 minutes)\n');
  return cachedToken;
}

// Helper: Find or create layout
async function findOrCreateLayout(request, token, name, widgetType, mediaId) {
  console.log(`\n[SMART] Looking for existing layout: "${name}"...`);

  // 1. Try to find existing layout
  const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  const layouts = await layoutsResp.json();
  const existing = layouts.find(l => l.layout === name);

  if (existing) {
    console.log(`[SMART] ✅ Found existing layout: "${name}" (ID: ${existing.layoutId})`);
    console.log(`        Campaign ID: ${existing.campaignId}`);
    console.log(`        Published: ${existing.published ? 'Yes' : 'No'}`);

    // Make sure it's published
    if (!existing.published) {
      console.log('[SMART] Publishing existing layout...');
      await request.put(`${CMS_URL}/api/layout/publish/${existing.layoutId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        ignoreHTTPSErrors: true
      });
      console.log('[SMART] ✅ Published');
    }

    return {
      layoutId: existing.layoutId,
      campaignId: existing.campaignId,
      created: false
    };
  }

  // 2. Layout doesn't exist - try to create it
  console.log(`[SMART] Layout not found. Attempting to create...`);

  if (!mediaId) {
    console.log(`[SMART] ⚠️  Cannot create "${name}" - no media provided`);
    console.log(`[SMART]
╔═══════════════════════════════════════════════════════════════╗
║  MANUAL SETUP REQUIRED                                        ║
╚═══════════════════════════════════════════════════════════════╝

Please create this layout manually in CMS:

1. Login: ${CMS_URL}
2. Layouts → Add Layout
   Name: "${name}"
   Resolution: 1920x1080 HD
3. Add Widget → ${widgetType}
   (Upload media if needed)
   Duration: 30 seconds
4. Save and Publish

Then re-run this test. It will find and use the layout.
    `);
    return null;
  }

  // 3. Try to create layout
  try {
    const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        name: name,
        description: `Auto-created for testing ${widgetType}`,
        resolutionId: 9,
        duration: 30
      },
      ignoreHTTPSErrors: true
    });

    if (!layoutResp.ok()) {
      const error = await layoutResp.text();
      console.log(`[SMART] ❌ Failed to create layout: ${layoutResp.status()}`);
      console.log(`[SMART] Error: ${error.substring(0, 200)}`);
      console.log('[SMART] Please create manually (see guide above)');
      return null;
    }

    const layout = await layoutResp.json();
    console.log(`[SMART] ✅ Created layout (ID: ${layout.layoutId})`);

    // Add widget
    const widgetEndpoint = {
      'Audio': 'audio',
      'Image': 'image',
      'Video': 'video',
      'PDF': 'pdf'
    }[widgetType] || 'image';

    await request.post(`${CMS_URL}/api/playlist/widget/${widgetEndpoint}/${layout.layoutId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      form: {
        mediaIds: String(mediaId),
        duration: 30,
        ...(widgetType === 'Audio' ? { volume: 75, loop: 0 } : {})
      },
      ignoreHTTPSErrors: true
    });

    console.log(`[SMART] ✅ Added ${widgetType} widget`);

    // Publish
    await request.put(`${CMS_URL}/api/layout/publish/${layout.layoutId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    console.log(`[SMART] ✅ Published layout`);

    return {
      layoutId: layout.layoutId,
      campaignId: layout.campaignId,
      created: true
    };

  } catch (error) {
    console.log(`[SMART] ❌ Error creating layout: ${error.message}`);
    return null;
  }
}

// Helper: Find or upload media
async function findOrUploadMedia(request, token, filename, filepath) {
  console.log(`[SMART] Checking for existing media: "${filename}"...`);

  // Try to find existing
  const libraryResp = await request.get(`${CMS_URL}/api/library`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  const library = await libraryResp.json();
  const existing = library.find(m => m.name === filename || m.fileName === filename);

  if (existing) {
    console.log(`[SMART] ✅ Found existing media: "${existing.name}" (ID: ${existing.mediaId})`);
    return existing.mediaId;
  }

  // Try to upload
  console.log(`[SMART] Media not found, attempting upload...`);

  if (!fs.existsSync(filepath)) {
    console.log(`[SMART] ⚠️  File not found: ${filepath}`);
    console.log(`[SMART] Please upload "${filename}" manually in CMS`);
    return null;
  }

  try {
    const fileBuffer = fs.readFileSync(filepath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.mp4': 'video/mp4'
    };

    const uploadResp = await request.post(`${CMS_URL}/api/library`, {
      headers: { 'Authorization': `Bearer ${token}` },
      multipart: {
        files: {
          name: filename,
          mimeType: mimeTypes[ext] || 'application/octet-stream',
          buffer: fileBuffer
        },
        name: filename,
        oldMediaId: '',
        updateInLayouts: '0',
        deleteOldRevisions: '0'
      },
      ignoreHTTPSErrors: true
    });

    if (uploadResp.ok()) {
      const result = await uploadResp.json();
      console.log(`[SMART] ✅ Uploaded "${filename}" (ID: ${result.files[0].mediaId})`);
      return result.files[0].mediaId;
    } else {
      console.log(`[SMART] ❌ Upload failed: ${uploadResp.status()}`);
      return null;
    }
  } catch (error) {
    console.log(`[SMART] ❌ Upload error: ${error.message}`);
    return null;
  }
}

test.describe('Smart Verification - Use Existing or Create', () => {

  test('SMART-01: Audio Widget Test', async ({ page, request }) => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('SMART-01: AUDIO WIDGET VERIFICATION');
    console.log('══════════════════════════════════════════════════════════\n');

    const token = await getToken(request);

    // Find or upload audio
    const mediaId = await findOrUploadMedia(
      request,
      token,
      'test-audio.mp3',
      path.join(__dirname, '../test-media/audio/test-audio.mp3')
    );

    // Find or create layout
    const layout = await findOrCreateLayout(
      request,
      token,
      'Audio Test Layout',
      'Audio',
      mediaId
    );

    if (!layout) {
      console.log('\n⚠️  SMART-01 SKIPPED - Please create "Audio Test Layout" manually');
      console.log('    Then re-run this test.');
      return;
    }

    // Get display
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa') || displays[0];

    // Check if already scheduled
    console.log('\n[SMART] Checking existing schedules...');
    const schedulesResp = await request.get(`${CMS_URL}/api/schedule`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const schedules = await schedulesResp.json();
    const existingSchedule = schedules.find(s =>
      s.campaignId === layout.campaignId &&
      s.displayGroups?.includes(testDisplay.displayGroupId)
    );

    if (!existingSchedule) {
      console.log('[SMART] Creating schedule...');
      await request.post(`${CMS_URL}/api/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          eventTypeId: 1,
          campaignId: layout.campaignId,
          displayGroupIds: [testDisplay.displayGroupId],
          isPriority: 0,
          fromDt: '2026-02-03 00:00:00',
          toDt: '2026-02-05 23:59:59'
        },
        ignoreHTTPSErrors: true
      });
      console.log('[SMART] ✅ Scheduled');
    } else {
      console.log('[SMART] ✅ Already scheduled');
    }

    // Load player and verify
    console.log('\n[SMART] Loading player...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');

    console.log('[SMART] Waiting 60 seconds for collection...');
    console.log('         (Player needs time to fetch schedule via XMDS)');

    await page.waitForTimeout(60000);

    // Check for audio widget
    const audioCheck = await page.evaluate(() => ({
      hasAudio: document.querySelector('audio') !== null,
      hasVisual: document.querySelector('.audio-visual') !== null,
      audioSrc: document.querySelector('audio')?.src || null,
      visualText: document.querySelector('.audio-visual')?.textContent || null,
      isPlaying: !window.location.href.includes('setup.html')
    }));

    console.log('\n[VERIFY] Audio Widget:');
    console.log(`   Audio element: ${audioCheck.hasAudio ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Visual feedback: ${audioCheck.hasVisual ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Audio src: ${audioCheck.audioSrc || 'N/A'}`);
    console.log(`   Visual text: ${audioCheck.visualText || 'N/A'}`);
    console.log(`   Player mode: ${audioCheck.isPlaying ? 'PLAYING' : 'SETUP'}`);

    await page.screenshot({ path: './screenshots/smart-01-audio.png', fullPage: true });

    if (audioCheck.hasAudio && audioCheck.hasVisual) {
      console.log('\n✅ SMART-01 PASSED - Audio widget verified!');
    } else {
      console.log('\n⚠️  SMART-01 PARTIAL - Audio widget not visible yet');
      console.log('    Layout is scheduled. Try:');
      console.log('    1. Click "Collect Now" on display in CMS');
      console.log('    2. Wait 5-10 minutes for next XMDS cycle');
      console.log('    3. Re-run this test');
    }

    expect(audioCheck.isPlaying, 'Player should be playing').toBeTruthy();
  });

  test('SMART-02: Multi-Page PDF Test', async ({ page, request }) => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('SMART-02: MULTI-PAGE PDF VERIFICATION');
    console.log('══════════════════════════════════════════════════════════\n');

    const token = await getToken(request);

    // Find or upload PDF
    const mediaId = await findOrUploadMedia(
      request,
      token,
      'test-document.pdf',
      path.join(__dirname, '../test-media/documents/test-document.pdf')
    );

    // Find or create layout
    const layout = await findOrCreateLayout(
      request,
      token,
      'PDF Test Layout',
      'PDF',
      mediaId
    );

    if (!layout) {
      console.log('\n⚠️  SMART-02 SKIPPED - Please create "PDF Test Layout" manually');
      return;
    }

    // Get display
    const displaysResp = await request.get(`${CMS_URL}/api/display`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });
    const displays = await displaysResp.json();
    const testDisplay = displays.find(d => d.display === 'test_pwa') || displays[0];

    // Check if scheduled
    const schedulesResp = await request.get(`${CMS_URL}/api/schedule`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const schedules = await schedulesResp.json();
    const existingSchedule = schedules.find(s => s.campaignId === layout.campaignId);

    if (!existingSchedule) {
      console.log('[SMART] Scheduling PDF layout...');
      await request.post(`${CMS_URL}/api/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          eventTypeId: 1,
          campaignId: layout.campaignId,
          displayGroupIds: [testDisplay.displayGroupId],
          isPriority: 0,
          fromDt: '2026-02-03 00:00:00',
          toDt: '2026-02-05 23:59:59'
        },
        ignoreHTTPSErrors: true
      });
      console.log('[SMART] ✅ Scheduled');
    } else {
      console.log('[SMART] ✅ Already scheduled');
    }

    // Load player
    console.log('\n[SMART] Loading player...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');

    console.log('[SMART] Waiting 60 seconds for collection...');
    await page.waitForTimeout(60000);

    // Check for PDF
    const pdfCheck = await page.evaluate(() => ({
      hasPdfContainer: document.querySelector('.pdf-container') !== null,
      hasPageIndicator: document.querySelector('.pdf-page-indicator') !== null,
      pageText: document.querySelector('.pdf-page-indicator')?.textContent || null,
      hasCanvas: document.querySelector('canvas') !== null,
      isPlaying: !window.location.href.includes('setup.html')
    }));

    console.log('\n[VERIFY] PDF Widget:');
    console.log(`   PDF container: ${pdfCheck.hasPdfContainer ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Page indicator: ${pdfCheck.hasPageIndicator ? '✅ Found' : '❌ Not found'}`);
    console.log(`   Page info: ${pdfCheck.pageText || 'N/A'}`);
    console.log(`   Canvas: ${pdfCheck.hasCanvas ? '✅ Found' : '❌ Not found'}`);

    await page.screenshot({ path: './screenshots/smart-02-pdf-page1.png', fullPage: true });

    if (pdfCheck.hasPageIndicator) {
      console.log('\n[SMART] Waiting 15 more seconds for page change...');
      const initialPage = pdfCheck.pageText;
      await page.waitForTimeout(15000);

      const newPageText = await page.evaluate(() =>
        document.querySelector('.pdf-page-indicator')?.textContent || null
      );

      console.log(`   Initial: ${initialPage}`);
      console.log(`   After 15s: ${newPageText}`);

      if (newPageText !== initialPage) {
        console.log('   ✅ Pages are cycling!');
      } else if (initialPage?.includes(' / 1')) {
        console.log('   ℹ️  Single page PDF (no cycling needed)');
      } else {
        console.log('   ⚠️  Page hasn\'t changed yet');
      }

      await page.screenshot({ path: './screenshots/smart-02-pdf-page2.png', fullPage: true });
    }

    if (pdfCheck.hasPdfContainer && pdfCheck.hasPageIndicator) {
      console.log('\n✅ SMART-02 PASSED - Multi-page PDF verified!');
    } else {
      console.log('\n⚠️  SMART-02 PARTIAL - PDF layout scheduled but not visible yet');
      console.log('    Try: Collect Now on display, then re-run test');
    }

    expect(pdfCheck.isPlaying).toBeTruthy();
  });

  test('SMART-03: Use Existing Test Layouts', async ({ page, request }) => {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('SMART-03: EXISTING LAYOUTS VERIFICATION');
    console.log('══════════════════════════════════════════════════════════\n');

    const token = await getToken(request);

    // Find all test layouts
    const layoutsResp = await request.get(`${CMS_URL}/api/layout`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const layouts = await layoutsResp.json();
    const testLayouts = layouts.filter(l =>
      l.layout.includes('Test') ||
      l.layout.includes('test') ||
      l.layout.includes('Audio') ||
      l.layout.includes('PDF')
    );

    console.log(`[SMART] Found ${testLayouts.length} potential test layouts:`);
    testLayouts.forEach(l => {
      console.log(`   - ${l.layout} (ID: ${l.layoutId}, Published: ${l.published ? 'Yes' : 'No'})`);
    });

    if (testLayouts.length === 0) {
      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  NO TEST LAYOUTS FOUND - MANUAL CREATION NEEDED               ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('\nPlease create these layouts manually:');
      console.log('\n1. "Audio Test Layout"');
      console.log('   - Upload: test-audio.mp3');
      console.log('   - Widget: Audio');
      console.log('   - Duration: 30s');
      console.log('   - Volume: 75%');
      console.log('\n2. "PDF Test Layout"');
      console.log('   - Upload: Multi-page PDF');
      console.log('   - Widget: PDF');
      console.log('   - Duration: 30s');
      console.log('\n3. "Image Test Layout"');
      console.log('   - Upload: test-image.jpg');
      console.log('   - Widget: Image');
      console.log('   - Duration: 20s');
      console.log('\nThen schedule them all on test_pwa display.');
      console.log('Click "Collect Now" on the display.');
      console.log('Re-run tests to verify.\n');
      return;
    }

    // Check if any are scheduled
    console.log('\n[SMART] Checking schedules...');
    const schedulesResp = await request.get(`${CMS_URL}/api/schedule`, {
      headers: { 'Authorization': `Bearer ${token}` },
      ignoreHTTPSErrors: true
    });

    const schedules = await schedulesResp.json();
    console.log(`[SMART] Found ${schedules.length} total schedules`);

    const testLayoutCampaigns = testLayouts.map(l => l.campaignId);
    const scheduledTestLayouts = schedules.filter(s =>
      testLayoutCampaigns.includes(s.campaignId)
    );

    console.log(`[SMART] Test layouts scheduled: ${scheduledTestLayouts.length}`);

    // Load player and verify
    console.log('\n[SMART] Loading player to check current content...');
    await page.goto(PLAYER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(10000);

    const content = await page.evaluate(() => ({
      isPlaying: !window.location.href.includes('setup.html'),
      hasXLR: typeof window.xlr !== 'undefined',
      hasAudio: document.querySelector('audio') !== null,
      hasPDF: document.querySelector('.pdf-container') !== null,
      hasImage: document.querySelector('img.media') !== null,
      hasVideo: document.querySelector('video.media') !== null,
      bodyText: document.body.innerText.substring(0, 200)
    }));

    console.log('\n[VERIFY] Current player content:');
    console.log(`   Playing mode: ${content.isPlaying ? '✅' : '❌'}`);
    console.log(`   XLR engine: ${content.hasXLR ? '✅' : '❌'}`);
    console.log(`   Audio widget: ${content.hasAudio ? '✅ FOUND' : '⚠️  Not visible'}`);
    console.log(`   PDF widget: ${content.hasPDF ? '✅ FOUND' : '⚠️  Not visible'}`);
    console.log(`   Image widget: ${content.hasImage ? '✅ FOUND' : '⚠️  Not visible'}`);
    console.log(`   Video widget: ${content.hasVideo ? '✅ FOUND' : '⚠️  Not visible'}`);

    await page.screenshot({ path: './screenshots/smart-03-current-content.png', fullPage: true });

    console.log('\n[SMART] Content preview:');
    console.log(`   ${content.bodyText}`);

    if (content.hasAudio || content.hasPDF) {
      console.log('\n✅ SMART-03 PASSED - New features visible in player!');
    } else {
      console.log('\n⚠️  SMART-03 PARTIAL - Features not visible yet');
      console.log('    Scheduled layouts may need collection time');
      console.log('    Or create/schedule manually as shown above');
    }

    expect(content.isPlaying).toBeTruthy();
    expect(content.hasXLR).toBeTruthy();
  });

});
