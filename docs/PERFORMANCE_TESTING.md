# PWA Player Performance Testing Guide

**Version**: 1.0
**Last Updated**: 2026-02-05
**Related**: [PERFORMANCE_OPTIMIZATIONS.md](PERFORMANCE_OPTIMIZATIONS.md)

---

## Table of Contents

1. [Quick Verification](#quick-verification)
2. [Comprehensive Testing](#comprehensive-testing)
3. [Performance Benchmarking](#performance-benchmarking)
4. [Memory Profiling](#memory-profiling)
5. [Visual Testing](#visual-testing)
6. [Network Analysis](#network-analysis)
7. [Troubleshooting](#troubleshooting)

---

## Quick Verification

**Time**: 5 minutes
**Purpose**: Verify all optimizations are active

### Prerequisites

- PWA player deployed and accessible
- Chrome or Firefox browser
- Test layout with 3+ widgets

### Steps

1. **Open Player**
   ```
   http://your-host:8081/player/pwa/
   ```

2. **Open DevTools**
   - Press `F12`
   - Click **Console** tab
   - Clear console (trash icon)

3. **Trigger Layout Load**
   - Refresh page (`Ctrl+F5`)
   - Or trigger collection cycle

4. **Verify Optimization Logs**

   ✅ **Parallel Chunk Downloads**:
   ```
   [Cache] Downloading 20 chunks in parallel (4 concurrent)
   [Cache] Chunk 0/19 complete (5.1%)
   [Cache] Chunk 1/19 complete (10.2%)
   [Cache] Chunk 2/19 complete (15.3%)
   [Cache] Chunk 3/19 complete (20.4%)
   ```

   **What to check**: Chunks 0-3 should complete within seconds of each other (overlapping), not sequentially.

   ✅ **Parallel Widget Fetching**:
   ```
   [PWA] Fetching 8 widget HTML resources in parallel...
   [PWA] ✓ Retrieved widget HTML for clock 123
   [PWA] ✓ Retrieved widget HTML for text 456
   [PWA] ✓ Retrieved widget HTML for weather 789
   [PWA] All widget HTML fetched
   ```

   **What to check**: All "Retrieved" logs should appear together (<1 second total).

   ✅ **Media URL Pre-fetching**:
   ```
   [RendererLite] Pre-fetching 5 media URLs in parallel...
   [RendererLite] All media URLs pre-fetched
   ```

   **What to check**: Should appear BEFORE "Pre-creating widget elements".

   ✅ **Element Reuse**:
   ```
   [RendererLite] Pre-creating widget elements for instant transitions...
   [RendererLite] All widget elements pre-created
   [RendererLite] Showing widget video (m85) in region r1
   ```

   **What to check**: Log says "Showing" (not "Rendering").

### Success Criteria

- [ ] All 4 optimization logs appear
- [ ] Chunk downloads overlap (not sequential)
- [ ] Widget HTML fetched in batch (<1s)
- [ ] Elements pre-created before layout starts
- [ ] No errors in console

**Result**: ✅ Optimizations Active | ❌ Issues Found (see Troubleshooting)

---

## Comprehensive Testing

**Time**: 30-60 minutes
**Purpose**: Full performance validation

### Test 1: Parallel Chunk Downloads

**Objective**: Verify 4x speedup for large files

**Setup**:
1. Create test layout with 1GB+ video file
2. Clear browser cache: `Ctrl+Shift+Delete` → "Cached images and files"
3. Open DevTools → Console

**Procedure**:
1. Trigger collection cycle (refresh player)
2. Watch console for chunk download logs
3. Note timestamps of chunk completion

**Expected Results**:

```
T+0s    [Cache] Background download started: video.mp4
T+0s    [Cache] Downloading 20 chunks in parallel (4 concurrent)
T+18s   [Cache] Chunk 0/19 complete (5.1%)    ← First chunk
T+20s   [Cache] Chunk 1/19 complete (10.2%)   ← Overlapping!
T+22s   [Cache] Chunk 2/19 complete (15.3%)   ← Overlapping!
T+24s   [Cache] Chunk 3/19 complete (20.4%)   ← Overlapping!
T+36s   [Cache] Chunk 4/19 complete (25.5%)   ← Next batch starts
...
T+120s  [Cache] Background download complete
```

**Success Criteria**:
- [ ] Chunks 0-3 complete within 10 seconds of each other
- [ ] Total download time < 50% of baseline (5 min → 2.5 min)
- [ ] No chunk download errors

**Baseline Comparison**:
| File Size | Sequential (Before) | Parallel (After) | Speedup |
|-----------|---------------------|------------------|---------|
| 500 MB | 2.5 min | 40 sec | 3.75x |
| 1 GB | 5 min | 80 sec | 3.75x |
| 2 GB | 10 min | 160 sec | 3.75x |

---

### Test 2: Parallel Widget Fetching

**Objective**: Verify 10x speedup for widget HTML

**Setup**:
1. Create layout with 10+ widgets (text, clock, weather, etc.)
2. Clear browser cache
3. Open DevTools → Console → Network tab

**Procedure**:
1. Refresh player
2. Watch Network tab for XHR/Fetch requests
3. Note timestamp of first and last widget fetch

**Expected Results**:

**Console**:
```
[PWA] Fetching 10 widget HTML resources in parallel...
[PWA] ✓ Retrieved widget HTML for clock 123
[PWA] ✓ Retrieved widget HTML for text 124
[PWA] ✓ Retrieved widget HTML for weather 125
... (7 more)
[PWA] All widget HTML fetched
```

**Network Tab**:
- All 10 requests start at same timestamp (±100ms)
- All complete within 1 second

**Success Criteria**:
- [ ] All widget requests parallel (not sequential)
- [ ] Total fetch time < 1 second
- [ ] All requests successful (200 OK)

**Baseline Comparison**:
| # Widgets | Sequential | Parallel | Speedup |
|-----------|-----------|----------|---------|
| 5 | 5s | <0.5s | 10x |
| 10 | 10s | <1s | 10x |
| 20 | 20s | <2s | 10x |

---

### Test 3: Media URL Pre-fetching

**Objective**: Verify instant widget rendering

**Setup**:
1. Layout with 5+ media widgets (images, videos)
2. Open DevTools → Console

**Procedure**:
1. Trigger layout load
2. Watch console timing between pre-fetch and widget rendering

**Expected Results**:

```
T+0s    [RendererLite] Pre-fetching 5 media URLs in parallel...
T+0.3s  [RendererLite] All media URLs pre-fetched
T+0.4s  [RendererLite] Pre-creating widget elements...
T+1.0s  [RendererLite] All widget elements pre-created
T+1.0s  [RendererLite] Showing widget image (m81)  ← Instant!
```

**Success Criteria**:
- [ ] All media URLs pre-fetched before widget creation
- [ ] Widget rendering instant (no await delays)
- [ ] No "Failed to fetch media" warnings

**Baseline Comparison**:
| # Media Widgets | Sequential | Pre-fetched | Speedup |
|----------------|-----------|-------------|---------|
| 5 | 2.5s | <0.5s | 5x |
| 10 | 5s | <0.8s | 6x |
| 20 | 10s | <1.5s | 7x |

---

### Test 4: Element Reuse

**Objective**: Verify smooth transitions and memory stability

**Part A: Visual Smoothness**

**Setup**:
1. Layout with 3+ widgets, transitions enabled
2. Watch player screen (not console)

**Procedure**:
1. Let layout cycle through all widgets 3 times
2. Observe transitions between widgets

**Expected Results**:
- No black screen between widgets
- No flicker or "pop" when widget changes
- Smooth fade/fly transitions
- Videos play continuously without restart

**Success Criteria**:
- [ ] Zero black screens
- [ ] Zero flicker events
- [ ] Transitions smooth (subjective)
- [ ] Videos don't restart on cycle

---

**Part B: DOM Inspection**

**Setup**:
1. Open DevTools → Elements tab
2. Find a region div during playback

**Procedure**:
1. Expand region element
2. Watch child elements as widgets cycle

**Expected DOM Structure**:

```html
<div class="renderer-lite-region" id="region_r1">
  <!-- All widgets present, visibility toggled -->
  <img style="visibility: hidden; opacity: 0">    ← Widget 1 (hidden)
  <video style="visibility: visible; opacity: 1"> ← Widget 2 (showing)
  <div style="visibility: hidden; opacity: 0">    ← Widget 3 (hidden)
</div>
```

**Success Criteria**:
- [ ] All widget elements present in DOM
- [ ] Elements NOT removed/recreated during cycling
- [ ] Only visibility/opacity changes
- [ ] Element count stable

---

**Part C: Memory Profiling**

**Setup**:
1. Chrome DevTools → Performance Monitor
   - `Ctrl+Shift+P` → "Show Performance Monitor"
2. Watch "JS Heap Size" metric

**Procedure**:
1. Note initial heap size
2. Let layout cycle 10 times
3. Note final heap size
4. Calculate growth

**Expected Results**:

```
Cycle 0:  500 MB  ← Initial
Cycle 1:  520 MB  ← Slight growth (pre-creation)
Cycle 2:  525 MB  ← Stabilizing
Cycle 3:  530 MB  ← Variance
Cycle 4:  528 MB  ← Stable
Cycle 5:  532 MB  ← Stable
...
Cycle 10: 535 MB  ← <50MB growth total
```

**Success Criteria**:
- [ ] Heap size stable (±50MB over 10 cycles)
- [ ] No linear growth pattern
- [ ] No memory leak warnings

**Baseline Comparison**:

| Cycles | Before (Leak) | After (Reuse) | Improvement |
|--------|---------------|---------------|-------------|
| 1 | 500 MB | 520 MB | Baseline |
| 5 | 900 MB | 530 MB | 370 MB saved |
| 10 | 1400 MB | 540 MB | 860 MB saved |

---

## Performance Benchmarking

### Full Layout Load Test

**Objective**: Measure end-to-end improvement

**Setup**:
1. Test layout:
   - 10 widgets (mixed types)
   - 2 large videos (500MB each)
   - Transitions enabled
2. Clear all caches
3. Open DevTools → Console

**Procedure**:
1. Note timestamp T0 (page load)
2. Trigger collection
3. Note timestamp T1 (layout starts playing)
4. Calculate: Layout Load Time = T1 - T0

**Expected Results**:

| Phase | Time | Activity |
|-------|------|----------|
| T+0s | 0s | Collection starts |
| T+2s | 2s | XLF downloaded, parsed |
| T+2s | 0s | Widget HTML fetched (parallel) |
| T+2.5s | 0.5s | Media URLs pre-fetched (parallel) |
| T+3s | 0.5s | Widget elements pre-created |
| T+3s | 0s | Layout starts (instant) |

**Total**: ~3 seconds

**Success Criteria**:
- [ ] Total load time < 5 seconds
- [ ] Layout starts playing within 3-5s
- [ ] No errors or warnings

**Baseline Comparison**:

```
Before Optimization:
T+0s   Collection starts
T+2s   XLF downloaded
T+4s   Widget 1 HTML fetched
T+5s   Widget 2 HTML fetched
...
T+14s  All widgets fetched
T+15s  Widget 1 rendered, media URL fetched
T+16s  Widget 1 shows
T+17s  Layout starts

Total: ~17 seconds
```

**Improvement**: 17s → 3s = **5.7x faster**

---

## Network Analysis

### Bandwidth Utilization Test

**Objective**: Verify 4x bandwidth utilization

**Setup**:
1. DevTools → Network tab
2. Clear cache
3. Test layout with 1GB video

**Procedure**:
1. Trigger download
2. Watch Network tab timing diagram
3. Count concurrent requests

**Expected Results**:

**Network Timeline**:
```
Request 1 (bytes 0-52MB):       ████████████████████
Request 2 (bytes 52-104MB):       ████████████████████
Request 3 (bytes 104-156MB):        ████████████████████
Request 4 (bytes 156-208MB):         ████████████████████
Request 5 (bytes 208-260MB):                      ████████
...
```

**Observations**:
- 4 concurrent Range requests active at once
- New request starts as soon as slot available
- Continuous activity (no idle gaps)

**Success Criteria**:
- [ ] 4 concurrent requests visible in timeline
- [ ] Network utilization >70% during download
- [ ] Download time matches 4x speedup

---

## Visual Testing

### Transition Quality Test

**Objective**: Subjective quality assessment

**Setup**:
1. Layout with fade/fly transitions
2. Full screen mode
3. Video recording (optional)

**Test Matrix**:

| Transition Type | Before | After | Pass/Fail |
|----------------|--------|-------|-----------|
| Fade in | Flicker | Smooth | [ ] |
| Fade out | Black screen | Smooth | [ ] |
| Fly N | Choppy | Smooth | [ ] |
| Fly S | Choppy | Smooth | [ ] |
| Fly E | Choppy | Smooth | [ ] |
| Fly W | Choppy | Smooth | [ ] |
| No transition | Pop/jump | Instant | [ ] |

**Success Criteria**:
- [ ] All transitions smooth
- [ ] No visible flicker
- [ ] No black screens
- [ ] Professional quality

---

## Troubleshooting

### Problem: Chunks Still Sequential

**Symptoms**:
```
[Cache] Chunk 0/19 complete (5.1%)
... 18 seconds pass ...
[Cache] Chunk 1/19 complete (10.2%)
```

**Debug Steps**:
1. Check console for "parallel" log:
   ```
   [Cache] Downloading N chunks in parallel (4 concurrent)
   ```
   If missing: Build didn't include optimization

2. Check Network tab:
   - Should see 4 concurrent Range requests
   - If only 1: Code not executing parallel path

3. Check deployed file:
   ```bash
   grep "Downloading.*chunks in parallel" assets/cache-*.js
   ```
   If not found: Redeploy needed

**Solution**: Rebuild and redeploy PWA

---

### Problem: Widgets Still Fetching Sequentially

**Symptoms**:
```
[PWA] Fetching widget HTML for clock 123
... 1 second ...
[PWA] Fetching widget HTML for text 456
```

**Debug Steps**:
1. Check for "in parallel" log
2. Check Network tab for parallel XHR requests
3. Verify Promise.all() in deployed code

**Solution**: Rebuild main.ts and redeploy

---

### Problem: Memory Still Growing

**Symptoms**: Heap size increases 100MB+ per cycle

**Debug Steps**:
1. Check console for element pre-creation logs
2. Inspect DOM: Are all elements present?
3. Check for "Widget X not pre-created" warnings

**Possible Causes**:
- Elements not in widgetElements Map (fallback to creation)
- Blob URLs being revoked during cycling (not layout change)
- Service Worker caching stale code

**Solution**: Clear all caches, hard reload

---

## Test Report Template

Use this template to document test results:

```markdown
# PWA Performance Test Report

**Date**: YYYY-MM-DD
**Tester**: Name
**Environment**: Production/Staging
**Player URL**: https://...

## Quick Verification
- [ ] Parallel chunks: PASS/FAIL
- [ ] Parallel widgets: PASS/FAIL
- [ ] Media pre-fetch: PASS/FAIL
- [ ] Element reuse: PASS/FAIL

## Performance Benchmarks
| Metric | Expected | Actual | Pass/Fail |
|--------|----------|--------|-----------|
| Layout load | <5s | Xs | PASS/FAIL |
| 1GB download | <2min | Xmin | PASS/FAIL |
| Widget fetch (10) | <1s | Xs | PASS/FAIL |
| Memory growth (10 cycles) | <50MB | XMB | PASS/FAIL |

## Issues Found
1. Issue description
   - Severity: High/Medium/Low
   - Workaround: ...

## Recommendations
- ...

## Overall Assessment
✅ Production Ready / ⚠️ Issues Found / ❌ Critical Issues
```

---

## Continuous Monitoring

### Production Checklist

Once deployed to production:

1. **Daily Monitoring**:
   - [ ] Check console logs for errors
   - [ ] Monitor download times
   - [ ] Watch memory usage

2. **Weekly Analysis**:
   - [ ] Review performance metrics
   - [ ] Check for memory leaks
   - [ ] Validate optimization logs present

3. **Monthly Review**:
   - [ ] Benchmark against baseline
   - [ ] Assess user experience
   - [ ] Plan optimizations if needed

---

## Summary

This testing guide ensures all performance optimizations are working correctly. The key metrics to watch:

1. **Parallel logs in console** - Proves optimizations active
2. **Sub-5s layout load** - Proves combined effectiveness
3. **Flat memory profile** - Proves no leaks
4. **Smooth transitions** - Proves element reuse working

**Target**: All tests passing = Production ready

For issues, see [Troubleshooting](#troubleshooting) or file a bug report with test results.
