# PWA-XLR Player - Exhaustive Testing Checklist

## Test Environment Setup

**URL:** `https://displays.superpantalles.com/player/xlr/`
**CMS:** `https://displays.superpantalles.com`
**Test Display:** `test_pwa` (hardwareKey: 0000000000000000000000003918c9fd)

---

## Phase 1: Core Functionality

### 1.1 Player Initialization
- [ ] Player loads without errors
- [ ] Setup page accessible and functional
- [ ] Configuration saves to localStorage
- [ ] XMDS RegisterDisplay succeeds (code: READY)
- [ ] Required files download successfully
- [ ] Schedule fetches and parses correctly

### 1.2 XLR Initialization
- [ ] XLR initializes without errors
- [ ] Splash screen displays briefly
- [ ] Transitions from splash to layout
- [ ] Console shows: `[PWA-XLR] XLR fully ready!`
- [ ] No JavaScript errors in console

**Verify in DevTools:**
```javascript
window.xlr.inputLayouts.length > 0  // Should be true
window.xlr.layouts.length >= 0      // Should be >= 0
window.xlr.currentLayoutId > 0      // Should be layout ID
```

---

## Phase 2: Layout Rendering

### 2.1 Single Layout Test

**Test Layout:** Create simple layout with:
- Background color (#263964 or custom)
- 1 clock widget
- 1 text widget
- 1 image widget

**Verify:**
- [ ] Background color displays correctly
- [ ] Layout dimensions match design (1920x1080 scaled to viewport)
- [ ] Layout container exists (`#L1-X`)
- [ ] No console errors during rendering

**Check in DevTools:**
```javascript
document.querySelectorAll('[id^="L"]').length  // Should be 1
window.xlr.currentLayout.width === 1920         // True
window.xlr.currentLayout.scaleFactor > 0        // True
```

### 2.2 Region Rendering

**Verify:**
- [ ] All regions created in DOM
- [ ] Region positions correct (top, left)
- [ ] Region dimensions correct (width, height)
- [ ] Regions scale proportionally to viewport
- [ ] Z-index layering works

**Check:**
```javascript
document.querySelectorAll('[id^="R"]').length  // Should match region count
document.getElementById('R-1-X').offsetHeight > 0  // True
```

### 2.3 Widget Rendering

**Test Each Widget Type:**

#### Clock Widget (clock-digital)
- [ ] Displays in correct region
- [ ] Shows current time
- [ ] Updates every second/minute
- [ ] Format matches CMS configuration
- [ ] No iframe errors

#### Text Widget
- [ ] Text content displays
- [ ] Formatting correct (font, size, color)
- [ ] Alignment correct
- [ ] No overflow issues

#### Image Widget
- [ ] Image loads and displays
- [ ] Scaling mode correct (fit/fill/stretch)
- [ ] Alignment correct
- [ ] No broken image icons

#### Video Widget (if available)
- [ ] Video loads
- [ ] Plays automatically
- [ ] Audio works (if enabled)
- [ ] Loops correctly (if configured)

#### Webpage Widget (if available)
- [ ] External webpage loads in iframe
- [ ] Scrolling works (if enabled)
- [ ] No CORS errors

**Check Widget URLs:**
```javascript
// Should show /pwa/getResource URLs:
Array.from(document.querySelectorAll('iframe'))
  .map(f => f.src.substring(0, 100))
```

---

## Phase 3: Layout Cycling

### 3.1 Single Layout Loop

**Setup:** Campaign with 1 layout, 60-second duration

**Verify:**
- [ ] Layout plays for correct duration
- [ ] Console shows: `[PWA-XLR] Layout ended: X`
- [ ] Layout restarts automatically
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] XMDS NotifyStatus called

**Monitor:**
```javascript
// Watch layout end events:
window.xlr.on('layoutEnd', (layout) => {
  console.log('Layout ended:', layout.layoutId, new Date());
});
```

### 3.2 Multi-Layout Campaign

**Setup:** Campaign with 3+ layouts

**Verify:**
- [ ] All layouts load in sequence
- [ ] Transitions work (fade in/out)
- [ ] Duration respected for each layout
- [ ] Cycles back to first layout after last
- [ ] No errors during transitions
- [ ] `window.xlr.currentLayoutId` updates correctly

**Monitor:**
```javascript
window.xlr.on('layoutChange', (layoutId) => {
  console.log('Layout changed to:', layoutId, new Date());
});
```

### 3.3 Campaign Priority

**Setup:** Multiple overlapping campaigns with different priorities

**Verify:**
- [ ] Higher priority campaign plays first
- [ ] Priority changes respected in real-time
- [ ] Schedule updates without player restart
- [ ] XMDS Schedule called every 15 minutes

---

## Phase 4: Advanced Features

### 4.1 Layout Transitions

**Test Transition Types:**
- [ ] fadeIn
- [ ] fadeOut
- [ ] flyLeft
- [ ] flyRight
- [ ] flyTop
- [ ] flyBottom

**Verify:**
- [ ] Transitions smooth (60fps)
- [ ] Transition duration correct
- [ ] No flicker between layouts
- [ ] Content doesn't jump

### 4.2 Widget Transitions

**Within layout, between widgets in a region:**
- [ ] Widget transitions work
- [ ] Duration correct
- [ ] Smooth playback

### 4.3 Overlay Layouts (if configured)

**Test:** Interrupts, scheduled overlays

**Verify:**
- [ ] Overlay appears over main layout
- [ ] Returns to main layout after overlay
- [ ] No interference with main loop

---

## Phase 5: Schedule Changes

### 5.1 Schedule Updates

**Test:**
1. Start player with Layout A
2. Change schedule in CMS (add Layout B)
3. Wait for collection cycle (or force refresh)

**Verify:**
- [ ] Player detects schedule change
- [ ] New layouts downloaded
- [ ] XLR updated with new schedule
- [ ] New layouts play without restart
- [ ] Console shows: `[PWA-XLR] Updating XLR with new layouts`

### 5.2 Dayparting

**Setup:** Schedule with time-based rules (morning/afternoon/evening)

**Verify:**
- [ ] Correct layouts play for current time
- [ ] Transitions at daypart boundaries
- [ ] Works across day changes

### 5.3 Empty Schedule

**Test:** Remove all scheduled layouts

**Verify:**
- [ ] Player shows default layout (if configured)
- [ ] OR shows splash screen
- [ ] No crashes
- [ ] Recovers when schedule restored

---

## Phase 6: Error Handling

### 6.1 Network Errors

**Test:**
- Disconnect network during playback
- Reconnect after 1 minute

**Verify:**
- [ ] Player continues with cached layouts
- [ ] Reconnects automatically when network returns
- [ ] Collection cycle resumes
- [ ] No data loss

### 6.2 CMS Unavailable

**Test:**
- Stop Xibo CMS container
- Let player run for collection interval
- Restart CMS

**Verify:**
- [ ] Player continues playing cached content
- [ ] Shows connection error in status (if displayed)
- [ ] Reconnects when CMS available
- [ ] Resumes normal operation

### 6.3 Invalid Layouts

**Test:**
- Upload layout with missing media
- OR layout with XML errors

**Verify:**
- [ ] Player skips invalid layout
- [ ] Continues with valid layouts
- [ ] Logs error to console
- [ ] Reports to CMS via XMDS

---

## Phase 7: Resource Management

### 7.1 Cache Behavior

**Verify:**
- [ ] Layouts cached correctly
- [ ] Media files cached
- [ ] Fonts cached
- [ ] Bundle files cached
- [ ] Old files cleaned up

**Check:**
```javascript
// Open DevTools → Application → Cache Storage
// Should see caches for layouts, media, resources
```

### 7.2 Memory Management

**Test:** Run player for 2+ hours

**Monitor in DevTools (Performance/Memory tabs):**
- [ ] No memory leaks
- [ ] Memory usage stable
- [ ] No accumulating DOM nodes
- [ ] Blob URLs cleaned up properly

**Check:**
```javascript
performance.memory.usedJSHeapSize  // Should be stable, not growing
```

### 7.3 Blob URL Cleanup

**Verify:**
```javascript
// XlrFileAdapter should clean up blob URLs
// Check console for:
[XLR-Adapter] Cleaned up blob URLs
```

---

## Phase 8: Browser Compatibility

### 8.1 Chrome/Chromium
- [ ] Renders correctly
- [ ] All features work
- [ ] No console errors
- [ ] Performance good

### 8.2 Firefox
- [ ] Renders correctly
- [ ] XLR initializes
- [ ] Widgets display
- [ ] Check for browser-specific issues

### 8.3 Safari (if available)
- [ ] Renders correctly
- [ ] Check webkit-specific CSS
- [ ] Test service worker

### 8.4 Edge
- [ ] Basic compatibility check

---

## Phase 9: Responsive Design

### 9.1 Different Resolutions

**Test at:**
- [ ] 1920×1080 (Full HD)
- [ ] 1366×768 (Common laptop)
- [ ] 3840×2160 (4K)
- [ ] 1280×720 (HD)

**Verify:**
- [ ] Layouts scale correctly
- [ ] ScaleFactor calculated properly
- [ ] Text readable
- [ ] Images not distorted

**Check scaleFactor:**
```javascript
window.xlr.currentLayout.scaleFactor  // Should be appropriate for viewport
```

### 9.2 Portrait Mode

**Test:** Rotate display or use portrait resolution (1080×1920)

**Verify:**
- [ ] Layouts adapt
- [ ] Scaling correct
- [ ] No overflow

---

## Phase 10: Performance Testing

### 10.1 Load Time

**Measure:**
- [ ] Initial page load < 3s
- [ ] XLR initialization < 1s
- [ ] First layout display < 2s (total)

### 10.2 Transition Performance

**Verify:**
- [ ] Transitions smooth (no stuttering)
- [ ] Frame rate steady (check DevTools Performance)
- [ ] CPU usage reasonable

### 10.3 Long-Running Stability

**Test:** Run for 24+ hours

**Monitor:**
- [ ] No memory leaks
- [ ] No crashes
- [ ] Consistent performance
- [ ] Schedules update correctly

---

## Phase 11: XLR-Specific Features

### 11.1 Layout Properties

**Test layouts with:**
- [ ] Custom backgrounds (colors, images)
- [ ] Different dimensions
- [ ] Multiple regions (5+)
- [ ] Overlapping regions (z-index)

### 11.2 Widget Properties

**Test widgets with:**
- [ ] Different durations
- [ ] Transparency
- [ ] Effects (shadows, borders)
- [ ] Animations

### 11.3 Advanced Widget Types

**If available in CMS:**
- [ ] Ticker widgets
- [ ] Embedded content
- [ ] DataSet views
- [ ] Calendar widgets
- [ ] Weather widgets

---

## Phase 12: Integration Testing

### 12.1 XMDS Communication

**Verify:**
- [ ] RegisterDisplay called on startup
- [ ] RequiredFiles called and processed
- [ ] Schedule polled every 15 minutes
- [ ] NotifyStatus called on layout end
- [ ] SubmitStats called (if configured)

### 12.2 XMR Messaging (if configured)

**Test:**
- [ ] Player connects to XMR
- [ ] Receives collect-now messages
- [ ] Receives change-layout messages
- [ ] Responds appropriately

### 12.3 Display Settings

**Test CMS display settings:**
- [ ] Collection interval honored
- [ ] Stats collection enabled/disabled
- [ ] Audit mode
- [ ] Override settings from CMS

---

## Phase 13: Comparison Testing

### 13.1 Side-by-Side Comparison

**Setup:**
1. Deploy both players:
   - Core PWA: `https://displays.superpantalles.com/player/core/`
   - PWA-XLR: `https://displays.superpantalles.com/player/xlr/`
2. Configure same display/schedule for both

**Compare:**
- [ ] Rendering quality
- [ ] Feature completeness
- [ ] Performance
- [ ] Stability
- [ ] Resource usage

### 13.2 Feature Parity

**Features Core PWA has:**
- [ ] Campaign cycling → XLR ✅
- [ ] Schedule updates → XLR ✅
- [ ] Media caching → XLR ✅

**Features Core PWA missing:**
- [ ] Layout transitions → XLR ✅
- [ ] Advanced widgets → XLR ✅
- [ ] Professional rendering → XLR ✅

---

## Phase 14: Stress Testing

### 14.1 Rapid Schedule Changes

**Test:**
- Change schedule every 30 seconds (in CMS)
- Force collection every minute

**Verify:**
- [ ] Player handles rapid updates
- [ ] No crashes
- [ ] Memory stable

### 14.2 Large Layouts

**Test:** Layout with:
- 10+ regions
- High-resolution images
- Multiple video widgets

**Verify:**
- [ ] Loads successfully
- [ ] Renders without lag
- [ ] Memory usage acceptable

### 14.3 Long Campaigns

**Test:** Campaign with 20+ layouts

**Verify:**
- [ ] All layouts load
- [ ] Cycles through all
- [ ] No memory accumulation
- [ ] Returns to first layout

---

## Phase 15: Browser DevTools Verification

### 15.1 Console Checks

**Run in Console:**
```javascript
// XLR State
console.log('XLR Ready:', !!window.xlr);
console.log('Input Layouts:', window.xlr.inputLayouts.length);
console.log('Processed Layouts:', window.xlr.layouts?.length || 0);
console.log('Current Layout ID:', window.xlr.currentLayoutId);
console.log('Unique Layouts:', Object.keys(window.xlr.uniqueLayouts || {}).length);

// Current Layout Details
const layout = window.xlr.currentLayout;
console.log('Layout Dimensions:', {
  xw: layout?.xw,
  xh: layout?.xh,
  sw: layout?.sw,
  sh: layout?.sh,
  scaleFactor: layout?.scaleFactor,
  sWidth: layout?.sWidth,
  sHeight: layout?.sHeight
});

// Regions
console.log('Region Count:', layout?.regions?.length || 0);
layout?.regions?.forEach((region, i) => {
  console.log(`Region ${i}:`, {
    width: region.sWidth,
    height: region.sHeight,
    widgets: region.mediaObjects?.length || 0
  });
});

// Widget URLs
document.querySelectorAll('iframe').forEach((iframe, i) => {
  console.log(`Iframe ${i}:`, iframe.src.substring(0, 150));
});
```

**Expected Results:**
- All counts > 0
- Dimensions > 0
- scaleFactor between 0.1 and 2.0
- Widget URLs start with `/pwa/getResource?v=7...`

### 15.2 Network Tab

**Verify:**
- [ ] No 404 errors
- [ ] No 403 errors (except initial registration if display unauthorized)
- [ ] `/pwa/getResource` requests return 200 OK
- [ ] Media files load successfully
- [ ] XMDS calls succeed

### 15.3 Application Tab

**Cache Storage:**
- [ ] `xibo-player-cache` exists
- [ ] Contains layouts, media, fonts
- [ ] Sizes reasonable

**LocalStorage:**
- [ ] `xibo_config` has correct configuration
- [ ] Contains CMS address, keys, display name

---

## Phase 16: Real-World Scenarios

### 16.1 Production Schedule

**Test with actual production content:**
- [ ] Real layouts from CMS
- [ ] Real media files
- [ ] Real campaign timing
- [ ] Real dayparting rules

### 16.2 Multi-Day Test

**Run continuously for 3+ days:**
- [ ] No crashes
- [ ] Schedule changes handled
- [ ] Performance stable
- [ ] Logs clean

### 16.3 Power Cycle Test

**Test:**
1. Unplug device / close browser
2. Wait 5 minutes
3. Power on / reopen browser

**Verify:**
- [ ] Player auto-starts
- [ ] Resumes from cache
- [ ] Reconnects to CMS
- [ ] Updates schedule

---

## Phase 17: Edge Cases

### 17.1 Clock Change

**Test:**
- Change system time forward 1 hour
- Change back

**Verify:**
- [ ] Schedule adjusts correctly
- [ ] Dayparting works
- [ ] No infinite loops

### 17.2 Timezone Changes

**If applicable:**
- [ ] Player handles timezone correctly
- [ ] Displays adjust to local time

### 17.3 Midnight Rollover

**Test:** Run overnight crossing midnight

**Verify:**
- [ ] Schedule recalculates for new day
- [ ] Date-based campaigns update
- [ ] No errors at midnight

---

## Phase 18: Widget-Specific Tests

### 18.1 Clock Widget

**Test:**
- [ ] 12-hour format
- [ ] 24-hour format
- [ ] Different locales
- [ ] Analog clock (if available)
- [ ] Digital clock with seconds

### 18.2 Ticker Widget

**Test:**
- [ ] Text scrolls correctly
- [ ] Speed matches configuration
- [ ] Direction correct (left/right/up/down)
- [ ] Wraps/repeats appropriately

### 18.3 DataSet Widgets

**If using datasets:**
- [ ] Data displays correctly
- [ ] Updates when dataset changes
- [ ] Pagination works
- [ ] Formatting correct

### 18.4 Twitter/Social Media (if available)

**Test:**
- [ ] Feeds load
- [ ] Updates periodically
- [ ] Handles rate limits

---

## Phase 19: Accessibility & Standards

### 19.1 Console Warnings

**Review console for:**
- [ ] No XLR warnings (or document acceptable ones)
- [ ] No CORS errors
- [ ] No CSP violations
- [ ] No deprecated API warnings

### 19.2 Network Efficiency

**Check:**
- [ ] Files cached appropriately (no redundant downloads)
- [ ] Reasonable bandwidth usage
- [ ] Progressive loading

---

## Phase 20: Documentation Verification

### 20.1 Setup Instructions

**Follow `README.md` from scratch:**
- [ ] Instructions clear
- [ ] All steps work
- [ ] No missing dependencies
- [ ] Configuration straightforward

### 20.2 Troubleshooting Guide

**Test scenarios in `XLR_INTEGRATION_NOTES.md`:**
- [ ] Troubleshooting steps work
- [ ] DevTools commands correct
- [ ] Solutions effective

---

## Automated Testing Script

**Create browser automation test:**

```javascript
// test-xlr.js - Run in browser console or Playwright

async function testXlrPlayer() {
  const tests = [];

  // Test 1: XLR initialized
  tests.push({
    name: 'XLR Initialized',
    pass: !!window.xlr && window.xlr.currentLayoutId > 0
  });

  // Test 2: Layouts processed
  tests.push({
    name: 'Layouts Processed',
    pass: window.xlr.inputLayouts.length > 0
  });

  // Test 3: Regions rendered
  const regionCount = document.querySelectorAll('[id^="R"]').length;
  tests.push({
    name: 'Regions Rendered',
    pass: regionCount > 0
  });

  // Test 4: Dimensions correct
  const layout = window.xlr.currentLayout;
  tests.push({
    name: 'Dimensions Calculated',
    pass: layout && layout.scaleFactor > 0 && layout.sw > 0 && layout.sh > 0
  });

  // Test 5: Widgets loaded
  const iframes = document.querySelectorAll('iframe');
  const validSrc = Array.from(iframes).some(f =>
    f.src.includes('/pwa/getResource')
  );
  tests.push({
    name: 'Widgets Loading',
    pass: iframes.length > 0 && validSrc
  });

  // Print results
  console.log('\n=== XLR Player Test Results ===\n');
  tests.forEach(test => {
    const status = test.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${test.name}`);
  });

  const allPassed = tests.every(t => t.pass);
  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'}\n`);

  return tests;
}

// Run tests
await testXlrPlayer();
```

---

## Success Criteria

**Minimum (MVP):**
- ✅ Player initializes without errors
- ✅ Layouts render with correct background
- ✅ At least one widget type displays
- ✅ Single layout loops correctly

**Full Success:**
- ✅ All widget types render correctly
- ✅ Multi-layout campaigns cycle smoothly
- ✅ Transitions work
- ✅ No console errors
- ✅ 24+ hour stability
- ✅ Matches or exceeds Core PWA functionality

**Production Ready:**
- ✅ All of Full Success above
- ✅ Tested on multiple browsers
- ✅ Real production content tested
- ✅ Performance acceptable
- ✅ Documentation complete
- ✅ Deployment automated

---

## Testing Tools

### Browser DevTools
- **Console:** For XLR state inspection
- **Network:** For request monitoring
- **Application:** For cache inspection
- **Performance:** For profiling
- **Memory:** For leak detection

### Playwright (Automated)
```bash
# Use existing browser automation to test player
# Run scenarios, capture screenshots, verify states
```

### Manual Testing
- Visual inspection
- User interaction simulation
- Real-world content

---

## Issue Tracking Template

**If you find issues, document:**

```markdown
### Issue: [Brief Description]

**Severity:** Critical / High / Medium / Low
**Component:** XLR / Layout / Widget / Cache / XMDS

**Steps to Reproduce:**
1. ...
2. ...

**Expected:**
...

**Actual:**
...

**Browser Console:**
```
[Paste errors/warnings]
```

**DevTools Info:**
```javascript
// Paste window.xlr state
```

**Screenshot:** [If applicable]

**Workaround:** [If known]
```

---

## Testing Progress Tracker

**Started:** [Date]
**Completed Phases:** 0/20
**Issues Found:** 0
**Issues Resolved:** 0

**Status:** Ready to begin testing

---

**This checklist ensures comprehensive validation of the PWA-XLR player before production deployment.**
