const { test, expect } = require('@playwright/test');

const PLAYER_URL = 'https://displays.superpantalles.com/player/xlr/';

test.setTimeout(180000);
test.use({ storageState: 'playwright/.auth/player-auth.json' });

test('VERIFY-CURRENT: Check what player is actually showing right now', async ({ page }) => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('CURRENT PLAYER STATE VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[PWA-XLR]') || text.includes('[XLR]') || text.includes('[XMDS]') || text.includes('[XMR]')) {
      console.log(`   ${text.substring(0, 120)}`);
    }
  });

  console.log('Loading player with saved authentication...');
  await page.goto(PLAYER_URL);
  await page.waitForLoadState('networkidle');

  console.log('Waiting 30 seconds for player to initialize and play...\n');
  await page.waitForTimeout(30000);

  // Get complete player state
  const state = await page.evaluate(() => {
    const xlr = window.xlr;
    return {
      // Page state
      url: window.location.href,
      isSetup: window.location.href.includes('setup.html'),
      title: document.title,

      // XLR engine
      hasXLR: typeof xlr !== 'undefined',
      xlrConfig: xlr?.config || null,

      // Current content
      hasImage: document.querySelector('img.media') !== null,
      imageCount: document.querySelectorAll('img.media').length,
      imageSources: Array.from(document.querySelectorAll('img.media')).map(img => img.src),

      hasVideo: document.querySelector('video.media') !== null,
      videoCount: document.querySelectorAll('video.media').length,
      videoSources: Array.from(document.querySelectorAll('video.media')).map(v => v.src),
      videoPlaying: Array.from(document.querySelectorAll('video.media')).map(v => !v.paused),

      hasAudio: document.querySelector('audio') !== null,
      audioCount: document.querySelectorAll('audio').length,
      audioSources: Array.from(document.querySelectorAll('audio')).map(a => a.src),
      hasAudioVisual: document.querySelector('.audio-visual') !== null,

      hasPDF: document.querySelector('.pdf-container') !== null,
      pdfCount: document.querySelectorAll('.pdf-container').length,
      hasPageIndicator: document.querySelector('.pdf-page-indicator') !== null,
      pageIndicatorText: document.querySelector('.pdf-page-indicator')?.textContent || null,

      hasText: document.querySelector('iframe') !== null,
      iframeCount: document.querySelectorAll('iframe').length,

      // Body content
      bodyText: document.body.innerText.substring(0, 500)
    };
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('PLAYER STATE');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`URL: ${state.url}`);
  console.log(`Mode: ${state.isSetup ? '⚠️  SETUP MODE' : '✅ PLAYING MODE'}`);
  console.log(`XLR Engine: ${state.hasXLR ? '✅ Loaded' : '❌ Not loaded'}`);

  if (state.xlrConfig) {
    console.log('\nXLR Configuration:');
    console.log(`   Display: ${state.xlrConfig.displayName || 'N/A'}`);
    console.log(`   CMS: ${state.xlrConfig.cmsAddress || 'N/A'}`);
    console.log(`   Hardware Key: ${state.xlrConfig.hardwareKey?.substring(0, 8)}...`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('CONTENT DETECTION');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Images: ${state.hasImage ? `✅ ${state.imageCount} found` : '❌ None'}`);
  if (state.imageSources.length > 0) {
    state.imageSources.forEach((src, i) => console.log(`   ${i + 1}. ${src.substring(0, 80)}...`));
  }

  console.log(`\nVideos: ${state.hasVideo ? `✅ ${state.videoCount} found` : '❌ None'}`);
  if (state.videoSources.length > 0) {
    state.videoSources.forEach((src, i) => {
      console.log(`   ${i + 1}. ${src.substring(0, 80)}... (Playing: ${state.videoPlaying[i] ? 'Yes' : 'No'})`);
    });
  }

  console.log(`\nAudio: ${state.hasAudio ? `✅ ${state.audioCount} found` : '❌ None'}`);
  console.log(`Audio Visual Feedback: ${state.hasAudioVisual ? '✅ Yes' : '❌ None'}`);
  if (state.audioSources.length > 0) {
    state.audioSources.forEach((src, i) => console.log(`   ${i + 1}. ${src.substring(0, 80)}...`));
  }

  console.log(`\nPDF: ${state.hasPDF ? `✅ ${state.pdfCount} found` : '❌ None'}`);
  console.log(`Page Indicator: ${state.hasPageIndicator ? `✅ ${state.pageIndicatorText}` : '❌ None'}`);

  console.log(`\nText/Widgets: ${state.hasText ? `✅ ${state.iframeCount} iframes` : '❌ None'}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('CONTENT PREVIEW');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(state.bodyText);

  // Capture screenshots
  await page.screenshot({ path: './screenshots/verify-current-full-page.png', fullPage: true });
  await page.screenshot({ path: './screenshots/verify-current-viewport.png' });

  // Check logs for errors
  const errors = consoleLogs.filter(log =>
    (log.toLowerCase().includes('error') || log.toLowerCase().includes('failed')) &&
    !log.includes('404') &&
    !log.includes('favicon')
  );

  if (errors.length > 0) {
    console.log('\n⚠️  Console Errors Detected:');
    errors.slice(0, 10).forEach(err => console.log(`   - ${err.substring(0, 100)}`));
  } else {
    console.log('\n✅ No errors in console');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!state.isSetup && state.hasXLR) {
    console.log('✅ Player is operational and playing content');

    const features = [];
    if (state.hasImage) features.push(`Images (${state.imageCount})`);
    if (state.hasVideo) features.push(`Videos (${state.videoCount})`);
    if (state.hasAudio) features.push(`Audio (${state.audioCount})`);
    if (state.hasPDF) features.push(`PDF (${state.pdfCount})`);
    if (state.hasText) features.push(`Text/Widgets (${state.iframeCount})`);

    if (features.length > 0) {
      console.log(`Content types playing: ${features.join(', ')}`);
    } else {
      console.log('⚠️  No widgets detected (may be loading)');
    }

    // Check for new features
    if (state.hasAudio && state.hasAudioVisual) {
      console.log('\n🎵 ✅ AUDIO WIDGET DETECTED - NEW FEATURE WORKING!');
    }

    if (state.hasPDF && state.hasPageIndicator) {
      console.log(`📄 ✅ MULTI-PAGE PDF DETECTED - NEW FEATURE WORKING!`);
      console.log(`   ${state.pageIndicatorText}`);
    }

  } else if (state.isSetup) {
    console.log('⚠️  Player in setup mode');
    console.log('   This means: Player needs to be configured');
    console.log('   Solution: Run 00-setup-once.spec.js');
  } else {
    console.log('⚠️  Unexpected player state');
  }

  console.log('\n');

  expect(state.hasXLR || !state.isSetup, 'Player should either have XLR or not be in setup').toBeTruthy();
  });

});
