# PWA-XLR Manual Testing Guide

**Complete manual test suite for verifying all Xibo player functions**

---

## 🎯 Testing Approach

**Philosophy:** Test everything a real user would see and interact with
**Method:** Visual verification with step-by-step checklist
**Duration:** 30-60 minutes for complete suite
**Browser:** Use your own browser (not automated)

---

## ⚙️ SETUP (5 minutes)

### Prerequisites

**Player URL:** https://displays.superpantalles.com/player/xlr/
**CMS URL:** https://displays.superpantalles.com
**Display:** test_pwa (already configured)
**Credentials:** Already authenticated ✓

### Initial Setup

1. **Open Player**
   - Open Chrome/Firefox
   - Go to: https://displays.superpantalles.com/player/xlr/
   - Press F12 (Developer Console)
   - Verify: Content is playing (not credentials screen)

   ✅ **PASS:** Content visible
   ❌ **FAIL:** Credentials screen → Run: `node restore-auth.js`

2. **Check Console**
   - Look for [PWA-XLR] messages (player initialization)
   - Check for red errors
   - Verify XLR engine messages

   ✅ **PASS:** Clean console or info messages only
   ❌ **FAIL:** Red errors or crashes

---

## 📋 MANUAL TEST SUITE

### TEST 1: Default Layout Playback ✓

**Current Status:** Layout A is cycling on your player ✓

**What you confirmed:**
- ✅ Content visible
- ✅ Layout A showing
- ✅ Cycling/repeating
- ✅ No credentials screen

---

### TEST 2: All 3 Test Layouts Display

**Purpose:** Verify Test Layouts A, B, C all display

**Your player should cycle through:**
- Test Layout A: Green/yellow (#c2e22c)
- Test Layout B: Red (#d02c2c)
- Test Layout C: Cyan (#22e2c7)

**Watch for 10 minutes and record:**

| Minutes | Layout Seen | Background Color | Notes |
|---------|-------------|------------------|-------|
| 0-2 | Layout A | Green/Yellow | ✓ Confirmed |
| 2-4 | | | |
| 4-6 | | | |
| 6-8 | | | |
| 8-10 | | | |

**Do you see all 3 layouts cycling?**
- ✅ YES → All layouts work
- ⚠️ PARTIAL → Some missing
- ❌ NO → Only one layout

---

### TEST 3: Media Within Layouts

**Purpose:** Verify media types render in layouts

**For Test Layout A, check what media types are shown:**

□ Images (static pictures)
□ Videos (moving content)
□ Text (formatted text widgets)
□ Clock/Date widgets
□ Embedded HTML
□ Web pages (iframes)

**Quality checks:**
- Images sharp and clear? ⬜
- Videos play smoothly? ⬜
- Text readable? ⬜
- No errors in console? ⬜

---

### TEST 4: Region Behavior

**Purpose:** Check how regions work in layouts

**In console, check current layout structure:**
```javascript
const layout = window.xlr?.getCurrentLayout?.();
console.log('Current layout:', layout);
console.log('Regions:', layout?.regions?.length);
```

**What to check:**

| Check | Result |
|-------|--------|
| How many regions in current layout? | ___ regions |
| All regions showing content? | ⬜ |
| Regions sized correctly? | ⬜ |
| Content fits within regions? | ⬜ |

---

### TEST 5: Content Transitions

**Purpose:** Verify smooth transitions between content

**Watch for content changes and rate:**

| Transition | Quality (1-5) | Notes |
|------------|---------------|-------|
| Layout to layout | /5 | |
| Media to media (same region) | /5 | |
| All content updates smoothly? | ⬜ | |

**Rating:**
- 5 = Perfectly smooth
- 3-4 = Minor flicker
- 1-2 = Black flashes, jarring

---

### TEST 6: Player Stability

**Purpose:** Ensure player doesn't crash or degrade

**Leave player running and check every 10 minutes:**

| Time | Status | Memory* | Issues |
|------|--------|---------|--------|
| 0 min | Running | - | None |
| 10 min | | | |
| 30 min | | | |
| 60 min | | | |
| 2 hours | | | |

*Check Chrome Task Manager (Shift+Esc) → Find player tab

✅ **PASS:** Stable, low/constant memory
❌ **FAIL:** Crashes, freezes, memory grows

---

### TEST 7: Schedule Collection

**Purpose:** Verify player picks up schedule changes

**Manual test:**
1. Note current time
2. In CMS, create new schedule event for test_pwa
3. Set to start 5 minutes from now
4. Observe if player picks it up automatically

| Check | Result |
|-------|--------|
| Player collects on schedule? | ⬜ |
| New content plays at set time? | ⬜ |
| Collection time accurate? | ⬜ |

**Collection interval:** ____ minutes

---

### TEST 8: Display Information Overlay

**Purpose:** Verify status overlay works

**Steps:**
1. Hover mouse over top of screen
2. Check for status bar appearing

**What should show:**
- CMS address
- Display name
- Number of layouts ready
- Current status

| Element | Visible | Correct Info |
|---------|---------|--------------|
| CMS address | ⬜ | ⬜ |
| Display name | ⬜ | ⬜ |
| Layouts ready count | ⬜ | ⬜ |
| Status messages | ⬜ | ⬜ |

---

### TEST 9: Caching & Offline

**Purpose:** Verify content plays offline

**Steps:**
1. Let player run online for 5 minutes (cache media)
2. In console: `console.log('Service Worker:', navigator.serviceWorker.controller)`
3. DevTools → Network tab → Set to "Offline"
4. Observe playback

| Check | Result |
|-------|--------|
| Content continues playing offline? | ⬜ |
| No error messages? | ⬜ |
| Cached media plays? | ⬜ |
| Smooth offline operation? | ⬜ |

**Return to Online:**
- Does player reconnect? ⬜
- Updates schedule? ⬜

---

### TEST 10: Browser Compatibility

**Purpose:** Test on different browsers

**Test on each browser:**

| Browser | Version | Loads | Plays | Issues |
|---------|---------|-------|-------|--------|
| Chrome | | ⬜ | ⬜ | |
| Firefox | | ⬜ | ⬜ | |
| Edge | | ⬜ | ⬜ | |
| Safari (if Mac) | | ⬜ | ⬜ | |

---

### TEST 11: Resolution & Scaling

**Purpose:** Verify player adapts to different screen sizes

**Test different resolutions:**

| Resolution | Content Scales | Text Readable | Layout OK |
|------------|----------------|---------------|-----------|
| 1920x1080 | ⬜ | ⬜ | ⬜ |
| 1280x720 | ⬜ | ⬜ | ⬜ |
| 3840x2160 (4K) | ⬜ | ⬜ | ⬜ |

**Change resolution:**
- DevTools → ⋮ → More tools → Sensors → Viewport
- Or: F12 → Device toolbar → Responsive → Enter custom size

---

### TEST 12: Special Widgets

**Purpose:** Test Xibo-specific widgets

**If configured in your layouts:**

| Widget Type | Shows | Updates | Quality |
|-------------|-------|---------|---------|
| Clock | ⬜ | ⬜ | ⬜ |
| Weather | ⬜ | ⬜ | ⬜ |
| RSS/Ticker | ⬜ | ⬜ | ⬜ |
| Data feeds | ⬜ | ⬜ | ⬜ |
| Currency/Stocks | ⬜ | ⬜ | ⬜ |

---

## 📊 FINAL ASSESSMENT

### Summary

**Tests Completed:** ___/12

**Overall Status:**
- □ ✅ All Pass - Production Ready
- □ ⚠️ Minor Issues - Acceptable
- □ ❌ Major Issues - Needs Work

### Critical Findings

**What Works Well:**
1.
2.
3.

**What Needs Improvement:**
1.
2.
3.

**Blockers (Must Fix):**
1.
2.

---

## 📁 FILES & EVIDENCE

**Screenshots saved:**
```bash
ls -lt screenshots/manual-*.png
```

**Console logs:**
- Right-click in console → Save as...
- Save to: `manual-test-console.log`

**Report:**
- Fill out this guide
- Save as: `MANUAL_TEST_RESULTS_[DATE].md`

---

## 🎯 CURRENT STATUS

**As of now:**
- ✅ Player deployed and running
- ✅ Authentication working
- ✅ Layout A confirmed cycling
- ✅ 3 test layouts available (A, B, C)
- ✅ Default layout as fallback

**Your Manual Player:**
- Displaying: Layout A
- Cycling: Yes
- Status: Working ✓

---

## NEXT STEPS

**Start with TEST 2** (you've already confirmed TEST 1):

Watch your player for 10 minutes and fill out the TEST 2 table showing when each layout appears.

**When done, review all results and create final assessment.**
