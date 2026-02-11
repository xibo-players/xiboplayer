# PWA Player Manual Test Plan

**Commits under test:**
- `2cb5c26` fix: prevent layout change failures from maxPlaysPerHour regressions
- `ca677aa` fix: progressive video streaming, chunk race condition, and layout play counting
- `deaaffe` feat: prioritize downloads for active layout media

**Test displays:**
- displayId=179 (pwa-355fede681004a1087e7fb0dfe90)
- displayId=180 (pwa-27ad38d52a97446ca4f00813def2)
- displayId=181 (pwa-c772d635836e4f038a829d67c60b)

---

## 1. Download Priority Ordering

**What:** Layout XLFs download first, then media sorted ascending by file size.

**How to test:** Clear all caches, reload. Check SW log for download enqueue order.

**Log evidence:** SW log shows `Enqueuing N files` followed by `Starting download: layout/XX` before any media, then media in ascending size order.

| Check | Status |
|-------|--------|
| Layouts enqueued before media | :white_check_mark: Confirmed (displayId=181, SW log lines 61-92) |
| Media sorted ascending by size | :white_check_mark: Confirmed (displayId=181: 23.mp4 29KB → 7.png 44KB → 27.pdf 86KB → pdf.worker 796KB → 5.mp4 272MB → 6.mp4 987MB) |
| Small files complete before large ones start | :white_check_mark: Confirmed (displayId=181, SW log lines 118-140) |

---

## 2. PRIORITIZE_DOWNLOAD Message

**What:** When a layout needs media still downloading, main thread sends priority signal to SW.

**How to test:** Schedule a layout that needs a large media file. Watch console + SW log during layout change.

**Log evidence:** Console: `Prioritizing download: media/X`. SW: `Received: PRIORITIZE_DOWNLOAD`, `Prioritize request: media/X`.

| Check | Status |
|-------|--------|
| Priority message sent from main thread | :white_check_mark: Confirmed (displayId=181, console) |
| SW receives and processes PRIORITIZE_DOWNLOAD | :white_check_mark: Confirmed (displayId=181, SW log lines 130-132) |
| Already-downloading file handled gracefully | :white_check_mark: Confirmed (`Already downloading: media/5`) |
| Queued file moved to front | :black_square_button: Not yet tested (requires file still in queue, not active) |

---

## 3. Progressive Video Streaming

**What:** Open-ended Range requests (`bytes=0-`) capped to single chunk to avoid assembling full file in memory.

**How to test:** Play a large video (>50MB). Check SW log for `Progressive streaming: capping` entries.

**Log evidence:** SW log: `Progressive streaming: capping bytes=X- to chunk Y`

| Check | Status |
|-------|--------|
| First range request capped (bytes=0-) | :white_check_mark: Confirmed (displayId=181, SW log line 232) |
| Subsequent range requests capped | :white_check_mark: Confirmed (displayId=181, SW log lines 251, 267) |
| Video plays smoothly despite capping | :white_check_mark: Confirmed (video playing at line 498) |
| No full-file assembly in memory | :white_check_mark: Confirmed (individual chunk responses, not concatenated) |

---

## 4. Chunk Race Condition Fix

**What:** Pending chunk storage tracked to prevent serving incomplete data.

**How to test:** Start playback immediately after download begins. Check SW log for chunk storage tracking.

**Log evidence:** SW log: `Chunk X stored` before any fetch attempts for that chunk.

| Check | Status |
|-------|--------|
| Chunks tracked as pending during write | :black_square_button: Not yet tested |
| Fetch waits for pending chunk to complete | :black_square_button: Not yet tested |
| No corrupted/partial video playback | :white_check_mark: Confirmed (video plays correctly on displayId=181) |

---

## 5. recordPlay at layoutEnd (not layoutStart)

**What:** Play count recorded when layout finishes, not when it starts. Prevents maxPlaysPerHour from interrupting mid-playback.

**How to test:** Let a layout play to completion. Check console for `Recorded play` appearing after `Layout ended`, not after `Layout started`.

**Log evidence:** Console: `Layout ended: X` immediately followed by `Recorded play for layout X`.

| Check | Status |
|-------|--------|
| recordPlay fires after layoutEnd | :white_check_mark: Confirmed (displayId=181, console line 372-373) |
| recordPlay does NOT fire at layoutStart | :white_check_mark: Confirmed (no recordPlay near Layout started logs) |
| maxPlaysPerHour counter accurate | :black_square_button: Not yet tested (need layout with maxPlays > 0) |

---

## 6. Video Duration Detection (useDuration)

**What:** Video duration read from metadata instead of fixed 60s default. XLF `useDuration` flag respected.

**How to test:** Play a layout with a video. Check console for duration update.

**Log evidence:** Console: `Video duration detected: Xs` and `Timer reset to Xs` where X != 60.

| Check | Status |
|-------|--------|
| Duration read from video metadata | :white_check_mark: Confirmed (displayId=181, 200s detected at console line 489) |
| Timer reset to actual duration | :white_check_mark: Confirmed (displayId=181, console line 492) |
| useDuration=0 uses XLF duration instead | :black_square_button: Not yet tested |
| Short video (<60s) uses correct duration | :black_square_button: Not yet tested |

---

## 7. Widget HTML Caching & Static Resources

**What:** Widget HTML cached with URL-based iframe src (not blob URL) so SW can intercept sub-resource requests. Static resources (bundle.min.js, fonts.css) fetched and cached.

**How to test:** Schedule a layout with widget content (clock, text, embedded). Check console for static resource caching.

**Log evidence:** Console: `[Cache] Cached static resource: bundle.min.js`. SW: `GET /player/pwa/cache/static/bundle.min.js [200]`.

| Check | Status |
|-------|--------|
| Widget HTML cached | :black_square_button: Not yet tested |
| iframe uses cache URL (not blob URL) | :black_square_button: Not yet tested |
| bundle.min.js fetched and cached | :black_square_button: Not yet tested |
| fonts.css fetched and cached | :black_square_button: Not yet tested |
| SW serves static resources with 200 | :black_square_button: Not yet tested |
| Widget renders content (not just background) | :black_square_button: Not yet tested |

---

## 8. Element Reuse Pattern

**What:** Widget elements pre-created at layout load, reused on replay via visibility toggle (not DOM recreation).

**How to test:** Let a layout cycle (play through all widgets, then replay). Check console for reuse messages.

**Log evidence:** Console: `Reusing element for widget X` on second cycle.

| Check | Status |
|-------|--------|
| Elements pre-created at layout load | :black_square_button: Not yet tested |
| Elements reused on layout replay | :black_square_button: Not yet tested |
| Video restarts (currentTime=0, play()) | :black_square_button: Not yet tested |
| No DOM recreation on replay | :black_square_button: Not yet tested |
| Memory stable after 10 cycles | :black_square_button: Not yet tested |

---

## 9. Blob URL Lifecycle

**What:** Blob URLs tracked per layout, revoked on layout switch. No memory leaks.

**How to test:** Switch between layouts. Check console for blob URL cleanup.

**Log evidence:** Console: `Revoking X blob URLs for layout Y`.

| Check | Status |
|-------|--------|
| Blob URLs created during element creation | :black_square_button: Not yet tested |
| Blob URLs revoked on layout switch | :black_square_button: Not yet tested |
| Media blob URLs cleaned from mediaUrlCache | :black_square_button: Not yet tested |
| Memory flat after multiple layout switches | :black_square_button: Not yet tested |

---

## 10. Hardware Key Stability

**What:** Deterministic hardware key based on stable device properties (CPU, platform, GPU). Prefix `pwa-`.

**How to test:** Note hardware key on first load. Reload page. Key must be identical.

**Log evidence:** Console: `Hardware key: pwa-XXXX` — same value on every reload.

| Check | Status |
|-------|--------|
| Key format: pwa-[28 hex chars] | :white_check_mark: Confirmed (displayId=181: pwa-c772d635836e4f038a829d67c60b) |
| Key stable across reloads | :white_check_mark: Confirmed (displayId=180: same key on Ctrl+R reload) |
| Key not all zeros | :white_check_mark: Confirmed |
| Different key per device | :white_check_mark: Confirmed (3 different displays = 3 different keys) |

---

## 11. Cache Validation

**What:** Cache entries validated before use (Content-Type, size). Corrupted entries deleted automatically.

**How to test:** Hard to trigger naturally. Could manually corrupt a cache entry in DevTools.

**Log evidence:** Console: `[Cache] Invalid cache entry detected, deleting...`

| Check | Status |
|-------|--------|
| Valid cache entries served correctly | :white_check_mark: Confirmed (all media served at 0ms on reload) |
| Corrupted entry detection | :black_square_button: Not yet tested (manual corruption needed) |
| Auto-deletion of invalid entries | :black_square_button: Not yet tested |

---

## 12. maxPlaysPerHour Fixes (5 sub-bugs)

**What:** Five bugs fixed in layout change flow related to maxPlaysPerHour.

### 12a. setPendingLayout uses real media IDs (not layoutId as mediaId)

| Check | Status |
|-------|--------|
| Pending layout resolved with correct media IDs | :white_check_mark: Confirmed (displayId=181, media/5 not media/87) |

### 12b. No duplicate getCurrentLayouts() call

| Check | Status |
|-------|--------|
| Schedule evaluated once per collection | :black_square_button: Not yet tested (check for duplicate filter logs) |

### 12c. layoutEnd skips collect() when pending layout exists

| Check | Status |
|-------|--------|
| No redundant XMDS round-trip on layoutEnd | :black_square_button: Not yet tested |

### 12d. Widget dependency uses SW static cache (not hardcoded displayId=1)

| Check | Status |
|-------|--------|
| No 404s for widget dependencies | :black_square_button: Not yet tested (need widget layout) |

### 12e. Concurrency guard prevents double layoutStart

| Check | Status |
|-------|--------|
| Single layoutStart per layout change | :white_check_mark: Confirmed (displayId=181, one `Layout started: 87`) |
| No duplicate recordPlay calls | :white_check_mark: Confirmed |

---

## 13. Ctrl+R Reload Behavior

**What:** Page reload re-registers SW, all cached resources served instantly.

**How to test:** After initial load, press Ctrl+R. Check that all resources come from cache at 0ms.

**Log evidence:** SW log: `0 downloads needed` and all fetch responses at 0ms.

| Check | Status |
|-------|--------|
| SW re-registers and activates quickly | :white_check_mark: Confirmed (displayId=180, SW log) |
| All resources served from cache | :white_check_mark: Confirmed (displayId=180, 0 downloads needed) |
| No unnecessary re-downloads | :white_check_mark: Confirmed |
| Layout plays immediately | :white_check_mark: Confirmed |

---

## 14. Layout Change (Single-Run Video)

**What:** Layout with single-run video plays completely, then switches to next scheduled layout.

**How to test:** Schedule layout with a video set to play once. Wait for video to finish.

**Log evidence:** Console: `Layout ended: X` after video duration elapsed, then `Layout started: Y` for next layout.

| Check | Status |
|-------|--------|
| Video plays to full duration | :white_check_mark: Confirmed (displayId=181, 200s video) |
| No premature layout interruption | :white_check_mark: Confirmed (log ends while still playing) |
| Layout change after video ends | :black_square_button: Not yet tested (log ended before video finished) |
| Next layout starts correctly | :black_square_button: Not yet tested |

---

## 15. Debug Mode

**What:** Debug logging enabled via `index.html` flag. Extra console output for troubleshooting.

| Check | Status |
|-------|--------|
| Debug logs visible in console | :white_check_mark: Confirmed (verbose logging in all captured logs) |
| Disable debug mode for production | :black_square_button: TODO when testing complete |

---

## Summary

| Category | Confirmed | Pending | Total |
|----------|-----------|---------|-------|
| 1. Download Priority | 3 | 0 | 3 |
| 2. PRIORITIZE_DOWNLOAD | 3 | 1 | 4 |
| 3. Progressive Streaming | 4 | 0 | 4 |
| 4. Chunk Race Condition | 1 | 2 | 3 |
| 5. recordPlay at layoutEnd | 2 | 1 | 3 |
| 6. Video Duration | 2 | 2 | 4 |
| 7. Widget HTML & Static | 0 | 6 | 6 |
| 8. Element Reuse | 0 | 5 | 5 |
| 9. Blob URL Lifecycle | 0 | 4 | 4 |
| 10. Hardware Key | 4 | 0 | 4 |
| 11. Cache Validation | 1 | 2 | 3 |
| 12. maxPlaysPerHour (5 bugs) | 3 | 3 | 6 |
| 13. Ctrl+R Reload | 4 | 0 | 4 |
| 14. Layout Change | 2 | 2 | 4 |
| 15. Debug Mode | 1 | 1 | 2 |
| **TOTAL** | **30** | **29** | **59** |

**51% confirmed from existing logs, 49% pending manual testing.**

### Priority for next testing session:
1. **Widget HTML & Static resources** (0/6 — needs layout with widgets)
2. **Element reuse** (0/5 — needs layout replay observation)
3. **Blob URL lifecycle** (0/4 — needs layout switch observation)
4. **Layout change completion** (need to capture log through full video end + next layout start)
