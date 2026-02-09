const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CMS_URL = 'https://displays.superpantalles.com';
const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';
const CLIENT_ID = '8a0af53cb0037928249edba12d335a30c7232e3d';
const CLIENT_SECRET = '9efa82485ac13f54b251f8a406a5a36d4512bf34df1f39380979aa7da4962d942b747d0bc045fe915d3834bc624b6b6d1a4804f8013267dd5beff8783d3a635c8127e28f18005a409809b6c15c431f114e40ce6d023229bfb737b4133984f980ca2afd43f64cf4c75a7810dc0b14acf68061dc502a857eb80e69577c8b3df4';
const TEST_MEDIA_DIR = path.join(__dirname, '../test-media');

test.setTimeout(300000); // 5 minutes per test

let accessToken = null;

/**
 * Get OAuth access token
 */
async function getAccessToken(request) {
  if (accessToken) return accessToken;

  const tokenResp = await request.post(`${CMS_URL}/api/authorize/access_token`, {
    form: {
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    },
    ignoreHTTPSErrors: true
  });

  const tokenData = await tokenResp.json();
  accessToken = tokenData.access_token;
  return accessToken;
}

/**
 * Upload media file to CMS
 */
async function uploadMedia(request, token, filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);

  const formData = {
    files: {
      name: fileName,
      mimeType: getMimeType(fileName),
      buffer: fileBuffer
    },
    name: fileName,
    oldMediaId: '',
    updateInLayouts: '0',
    deleteOldRevisions: '0'
  };

  const response = await request.post(`${CMS_URL}/api/library`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    multipart: formData,
    ignoreHTTPSErrors: true
  });

  if (!response.ok()) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status()} - ${error}`);
  }

  const result = await response.json();
  return result.files[0]; // Returns { mediaId, fileName, fileSize, ... }
}

/**
 * Get MIME type for file
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Create layout with widget
 */
async function createLayoutWithMedia(request, token, mediaId, mediaType, layoutName) {
  // 1. Create layout
  const layoutResp = await request.post(`${CMS_URL}/api/layout`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      name: layoutName,
      description: `Test layout for ${mediaType}`,
      resolutionId: 9, // 1920x1080
      duration: 30
    },
    ignoreHTTPSErrors: true
  });

  const layout = await layoutResp.json();
  const layoutId = layout.layoutId;

  console.log(`   Layout created: ${layoutId}`);

  // 2. Add widget based on media type
  const widgetType = getWidgetType(mediaType);
  const widgetResp = await request.post(`${CMS_URL}/api/playlist/widget/${widgetType}/${layoutId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    form: {
      mediaIds: String(mediaId),
      duration: 30
    },
    ignoreHTTPSErrors: true
  });

  if (!widgetResp.ok()) {
    const error = await widgetResp.text();
    throw new Error(`Widget creation failed: ${widgetResp.status()} - ${error}`);
  }

  console.log(`   Widget added: ${widgetType}`);

  // 3. Publish layout
  await request.put(`${CMS_URL}/api/layout/publish/${layoutId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  console.log(`   Layout published`);

  return { layoutId, campaignId: layout.campaignId };
}

/**
 * Get widget type for media type
 */
function getWidgetType(mediaType) {
  const types = {
    'image': 'image',
    'video': 'video',
    'audio': 'audio',
    'document': 'pdf' // PDF widget
  };
  return types[mediaType] || 'image';
}

/**
 * Schedule layout on display
 */
async function scheduleLayout(request, token, campaignId, displayGroupId) {
  const scheduleResp = await request.post(`${CMS_URL}/api/schedule`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      eventTypeId: 1,
      campaignId: campaignId,
      displayGroupIds: [displayGroupId],
      isPriority: 0,
      fromDt: '2026-01-01 00:00:00',
      toDt: '2027-12-31 23:59:59'
    },
    ignoreHTTPSErrors: true
  });

  if (!scheduleResp.ok()) {
    const error = await scheduleResp.text();
    throw new Error(`Schedule failed: ${scheduleResp.status()} - ${error}`);
  }

  const result = await scheduleResp.json();
  console.log(`   Scheduled: Event ID ${result.eventId || 'N/A'}`);
  return result;
}

/**
 * Get test_pwa display
 */
async function getTestDisplay(request, token) {
  const displaysResp = await request.get(`${CMS_URL}/api/display`, {
    headers: { 'Authorization': `Bearer ${token}` },
    ignoreHTTPSErrors: true
  });

  const displays = await displaysResp.json();
  return displays.find(d => d.display === 'test_pwa');
}

/**
 * Clean up test resources
 */
async function cleanup(request, token, layoutId, mediaId, eventId) {
  try {
    if (eventId) {
      await request.delete(`${CMS_URL}/api/schedule/${eventId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        ignoreHTTPSErrors: true
      });
      console.log(`   Deleted schedule: ${eventId}`);
    }

    if (layoutId) {
      await request.delete(`${CMS_URL}/api/layout/${layoutId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        ignoreHTTPSErrors: true
      });
      console.log(`   Deleted layout: ${layoutId}`);
    }

    if (mediaId) {
      await request.delete(`${CMS_URL}/api/library/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        ignoreHTTPSErrors: true
      });
      console.log(`   Deleted media: ${mediaId}`);
    }
  } catch (error) {
    console.warn(`   Cleanup error: ${error.message}`);
  }
}

// ============================================================================
// MEDIA TYPE TESTS
// ============================================================================

test.describe('Media Type Support', () => {

  test('MEDIA-01: JPG Image Support', async ({ page, request }) => {
    console.log('\n=== JPG IMAGE TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);
    expect(testDisplay, 'test_pwa display should exist').toBeDefined();

    const filePath = path.join(TEST_MEDIA_DIR, 'images/test-image.jpg');
    const fileName = 'e2e-test-image.jpg';

    let mediaId, layoutId, eventId;

    try {
      // 1. Upload image
      console.log('1. Uploading JPG image...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      // 2. Create layout with image widget
      console.log('\n2. Creating layout with image widget...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'image', 'E2E Test - JPG Image'
      );
      layoutId = lid;

      // 3. Schedule on display
      console.log('\n3. Scheduling on test_pwa...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      // 4. Load player and verify
      console.log('\n4. Loading player...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000); // Wait for collection

      // 5. Screenshot
      await page.screenshot({
        path: './screenshots/media-01-jpg-playback.png',
        fullPage: true
      });

      console.log('\n✅ JPG IMAGE TEST COMPLETE');
      console.log('   Screenshot saved for manual verification');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-02: PNG Image Support', async ({ page, request }) => {
    console.log('\n=== PNG IMAGE TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'images/test-image.png');
    const fileName = 'e2e-test-image.png';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading PNG image...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'image', 'E2E Test - PNG Image'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000);

      await page.screenshot({ path: './screenshots/media-02-png-playback.png', fullPage: true });

      console.log('\n✅ PNG IMAGE TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-03: GIF Image Support', async ({ page, request }) => {
    console.log('\n=== GIF IMAGE TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'images/test-image.gif');
    const fileName = 'e2e-test-image.gif';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading GIF image...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'image', 'E2E Test - GIF Image'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000);

      await page.screenshot({ path: './screenshots/media-03-gif-playback.png', fullPage: true });

      console.log('\n✅ GIF IMAGE TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-04: SVG Image Support', async ({ page, request }) => {
    console.log('\n=== SVG IMAGE TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'images/test-image.svg');
    const fileName = 'e2e-test-image.svg';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading SVG image...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'image', 'E2E Test - SVG Image'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000);

      await page.screenshot({ path: './screenshots/media-04-svg-playback.png', fullPage: true });

      console.log('\n✅ SVG IMAGE TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-05: MP4 Video Support', async ({ page, request }) => {
    console.log('\n=== MP4 VIDEO TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'videos/test-video.mp4');
    const fileName = 'e2e-test-video.mp4';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading MP4 video...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout with video widget...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'video', 'E2E Test - MP4 Video'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(25000); // Extra time for video

      await page.screenshot({ path: './screenshots/media-05-mp4-playback.png', fullPage: true });

      console.log('\n✅ MP4 VIDEO TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-06: WebM Video Support', async ({ page, request }) => {
    console.log('\n=== WEBM VIDEO TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'videos/test-video.webm');
    const fileName = 'e2e-test-video.webm';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading WebM video...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'video', 'E2E Test - WebM Video'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(25000);

      await page.screenshot({ path: './screenshots/media-06-webm-playback.png', fullPage: true });

      console.log('\n✅ WEBM VIDEO TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-07: MP3 Audio Support', async ({ page, request }) => {
    console.log('\n=== MP3 AUDIO TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'audio/test-audio.mp3');
    const fileName = 'e2e-test-audio.mp3';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading MP3 audio...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout with audio widget...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'audio', 'E2E Test - MP3 Audio'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000);

      await page.screenshot({ path: './screenshots/media-07-mp3-playback.png', fullPage: true });

      console.log('\n✅ MP3 AUDIO TEST COMPLETE');
      console.log('   Note: Audio playback requires manual verification (listen)');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-08: WAV Audio Support', async ({ page, request }) => {
    console.log('\n=== WAV AUDIO TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'audio/test-audio.wav');
    const fileName = 'e2e-test-audio.wav';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading WAV audio...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'audio', 'E2E Test - WAV Audio'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(20000);

      await page.screenshot({ path: './screenshots/media-08-wav-playback.png', fullPage: true });

      console.log('\n✅ WAV AUDIO TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

  test('MEDIA-09: PDF Document Support', async ({ page, request }) => {
    console.log('\n=== PDF DOCUMENT TEST ===\n');

    const token = await getAccessToken(request);
    const testDisplay = await getTestDisplay(request, token);

    const filePath = path.join(TEST_MEDIA_DIR, 'documents/test-document.pdf');
    const fileName = 'e2e-test-document.pdf';

    let mediaId, layoutId, eventId;

    try {
      console.log('1. Uploading PDF document...');
      const media = await uploadMedia(request, token, filePath, fileName);
      mediaId = media.mediaId;
      console.log(`   ✅ Uploaded: Media ID ${mediaId}`);

      console.log('\n2. Creating layout with PDF widget...');
      const { layoutId: lid, campaignId } = await createLayoutWithMedia(
        request, token, mediaId, 'document', 'E2E Test - PDF Document'
      );
      layoutId = lid;

      console.log('\n3. Scheduling...');
      const schedule = await scheduleLayout(request, token, campaignId, testDisplay.displayGroupId);
      eventId = schedule.eventId;

      console.log('\n4. Verifying playback...');
      await page.goto(PLAYER_URL);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(25000); // Extra time for PDF rendering

      await page.screenshot({ path: './screenshots/media-09-pdf-playback.png', fullPage: true });

      console.log('\n✅ PDF DOCUMENT TEST COMPLETE');

    } finally {
      console.log('\n5. Cleanup...');
      await cleanup(request, token, layoutId, mediaId, eventId);
    }
  });

});
