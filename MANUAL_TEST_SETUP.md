# Manual Test Setup Guide - Simple Steps

**For:** Testing Audio and Multi-Page PDF features
**Time:** ~10 minutes
**Complexity:** Easy (via CMS UI)

---

## Prerequisites

- ✅ Player deployed: https://h1.superpantalles.com/player/xlr/
- ✅ CMS accessible: https://displays.superpantalles.com
- ✅ Login: xibo_admin / {password}
- ✅ Audio widget code: Deployed
- ✅ Multi-page PDF code: Deployed

---

## Test 1: Audio Widget (5 minutes)

### Step 1: Upload Audio File

1. Login to CMS: https://displays.superpantalles.com
2. Go to: **Library → Media**
3. Click: **Add Media**
4. Upload: `e2e-tests/test-media/audio/test-audio.mp3`
5. Click: **Save**
6. Note the Media ID (or just remember the filename)

### Step 2: Create Audio Layout

1. Go to: **Layouts → Add Layout**
2. Fill in:
   - Name: `Audio Test`
   - Resolution: `1920x1080 HD Landscape`
3. Click: **Add Layout**

### Step 3: Add Audio Widget

1. Layout opens in editor
2. Click on the region (center rectangle)
3. From toolbar: **Add Widget** → **Audio**
4. Select: `test-audio.mp3`
5. Duration: `30` seconds
6. Volume: `75`
7. Loop: `No`
8. Click: **Save**

### Step 4: Publish Layout

1. Top menu: **Actions** → **Publish**
2. Confirm publish

### Step 5: Schedule on Display

1. Go to: **Displays → test_pwa**
2. Click on display name
3. Click: **Schedule** tab
4. Click: **Add Event**
5. Fill in:
   - Event Type: `Layout`
   - Layout: Select `Audio Test`
   - From: Today's date
   - To: Tomorrow's date
6. Click: **Save**

### Step 6: Trigger Collection

1. Still on display page
2. Click: **Collect Now** button (top right)
3. Wait 5-10 seconds

### Step 7: Verify in Player

1. Open: https://h1.superpantalles.com/player/xlr/
2. **Expected:**
   - Purple gradient background
   - Animated ♪ music note (pulsing)
   - Text: "Playing Audio"
   - Filename: "test-audio.mp3"
   - **Audio playing** (turn up volume!)

**✅ If you see/hear this → Audio widget works!**

---

## Test 2: Multi-Page PDF (5 minutes)

### Step 1: Upload Multi-Page PDF

1. In CMS: **Library → Media**
2. Click: **Add Media**
3. Upload a PDF with **5+ pages**
   - Or use: `e2e-tests/test-media/documents/test-document.pdf`
4. Click: **Save**

### Step 2: Create PDF Layout

1. **Layouts → Add Layout**
2. Name: `PDF Multi-Page Test`
3. Resolution: `1920x1080 HD Landscape`
4. Click: **Add Layout**

### Step 3: Add PDF Widget

1. Click on region
2. **Add Widget** → **PDF**
3. Select: Your uploaded PDF
4. Duration: `30` seconds (will auto-cycle pages)
5. Click: **Save**

### Step 4: Publish and Schedule

1. **Actions** → **Publish**
2. Go to: **Displays → test_pwa**
3. **Schedule** tab → **Add Event**
4. Event Type: `Layout`
5. Layout: `PDF Multi-Page Test`
6. From/To: Today/Tomorrow
7. **Save**

### Step 5: Trigger Collection

1. Click: **Collect Now** on display
2. Wait 10 seconds

### Step 6: Verify in Player

1. Open player: https://h1.superpantalles.com/player/xlr/
2. **Expected:**
   - PDF renders (gray background)
   - **Bottom-right corner:** "Page 1 / X"
   - Wait 6-10 seconds (depends on page count)
   - **Page indicator changes:** "Page 2 / X"
   - Smooth fade transition between pages
   - Pages cycle through all pages

**Calculation:**
- Duration: 30 seconds
- Pages: 5
- Time per page: 30 ÷ 5 = **6 seconds**

**✅ If pages cycle with indicator → Multi-page PDF works!**

---

## Test 3: Verify Existing Content (1 minute)

### Simplest Test

1. Open: https://h1.superpantalles.com/player/xlr/
2. **Check:**
   - Player loads (not stuck on setup)
   - Content is displaying
   - No errors in console (F12 → Console)

**✅ If player shows content → Basic functionality works!**

---

## Troubleshooting

### Audio Not Playing

**Check:**
- Volume on computer not muted
- Browser allows autoplay (click anywhere on page first)
- Console shows: `[Audio] Playing: ...`

### PDF Not Showing Multiple Pages

**Check:**
- PDF actually has multiple pages
- Duration is long enough (min 2s per page)
- Page indicator appears
- Console shows: `[PDF] Loading: X pages...`

### Player Stuck on Setup

**Check:**
- Browser localStorage has config (F12 → Application → Local Storage)
- Clear cache and reload
- Run: `00-setup-once.spec.js` test

---

## Alternative: Use Existing Layouts

**Instead of creating new layouts:**

1. Go to CMS: **Layouts**
2. Find existing layouts:
   - "Test Layout A" (green background)
   - "Test Layout B" (blue background)
   - Or any layout already created

3. **Displays → test_pwa → Schedule**
4. Add event with existing layout
5. **Collect Now**
6. Verify in player

**Benefit:** No need to create/upload anything, just use what exists

---

## Quick Verification Command

```bash
# Run simple existing tests
cd platforms/pwa-xlr/e2e-tests
npx playwright test tests/01-playback-default.spec.js --headed

# Should pass if player is working
```

---

## Summary

**Manual testing is EASIER and FASTER for verification:**

**Audio:** 5 minutes to create and verify
**PDF:** 5 minutes to create and verify
**Existing:** 1 minute to verify player works

**Total:** 11 minutes to fully verify everything manually

**vs Automated:** Complex timing issues, harder to debug

**Recommendation:** Do manual verification in the morning, it's simpler! ☕

---

**Ready for you when you wake up:**
1. Player deployed with audio & PDF ✅
2. Documentation complete ✅
3. Manual test guide ready ✅
4. Takes 10 minutes to verify everything ✅

**Sleep well!** 🌙
