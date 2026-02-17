/**
 * Offline Schedule Timeline Calculator
 *
 * Calculates deterministic playback timelines by parsing layout XLF durations
 * and simulating round-robin scheduling. Enables the player to answer
 * "what's the playback plan for the next N hours?" while offline.
 */

/**
 * Parse layout duration from XLF XML string.
 * Lightweight parser — uses DOMParser, no rendering.
 *
 * Duration resolution order:
 *  1. Explicit <layout duration="60"> attribute
 *  2. Sum of widget <media duration="X"> per region (max across regions)
 *  3. Fallback: 60s
 *
 * @param {string} xlfXml - Raw XLF XML string
 * @returns {number} Duration in seconds
 */
export function parseLayoutDuration(xlfXml) {
  const doc = new DOMParser().parseFromString(xlfXml, 'text/xml');
  const layoutEl = doc.querySelector('layout');
  if (!layoutEl) return 60;

  // 1. Explicit layout duration attribute
  const explicit = parseInt(layoutEl.getAttribute('duration') || '0', 10);
  if (explicit > 0) return explicit;

  // 2. Calculate from widget durations (max region wins — regions play in parallel)
  let maxDuration = 0;
  for (const regionEl of layoutEl.querySelectorAll('region')) {
    let regionDuration = 0;
    for (const mediaEl of regionEl.querySelectorAll('media')) {
      const dur = parseInt(mediaEl.getAttribute('duration') || '0', 10);
      const useDuration = parseInt(mediaEl.getAttribute('useDuration') || '1', 10);
      if (dur > 0 && useDuration !== 0) {
        regionDuration += dur;
      } else {
        // Video with useDuration=0 means "play to end" — estimate 60s,
        // corrected later via recordLayoutDuration() when video metadata loads
        regionDuration += 60;
      }
    }
    maxDuration = Math.max(maxDuration, regionDuration);
  }

  return maxDuration > 0 ? maxDuration : 60;
}

/**
 * Compare two arrays of layout files for equality.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Calculate a deterministic playback timeline by simulating round-robin scheduling.
 * Pure function — no side effects, no global state.
 *
 * @param {Object} schedule - ScheduleManager instance (needs getLayoutsAtTime() and schedule.default)
 * @param {Map<string, number>} durations - Map of layoutFile → duration in seconds
 * @param {Object} [options]
 * @param {Date}   [options.from]    - Start time (default: now)
 * @param {number} [options.hours]   - Hours to simulate (default: 2)
 * @param {number} [options.defaultDuration] - Fallback duration in seconds (default: 60)
 * @returns {Array<{layoutFile: string, startTime: Date, endTime: Date, duration: number, isDefault: boolean}>}
 */
export function calculateTimeline(schedule, durations, options = {}) {
  const from = options.from || new Date();
  const hours = options.hours || 2;
  const to = new Date(from.getTime() + hours * 3600000);
  const defaultDuration = options.defaultDuration || 60;
  const timeline = [];
  let currentTime = new Date(from);

  // Safety: cap at 500 entries to prevent runaway loops
  const maxEntries = 500;

  while (currentTime < to && timeline.length < maxEntries) {
    const layoutFiles = schedule.getLayoutsAtTime(currentTime);

    if (layoutFiles.length === 0) {
      // No scheduled layouts — use default or skip ahead
      const defaultFile = schedule.schedule?.default;
      if (defaultFile) {
        const dur = durations.get(defaultFile) || defaultDuration;
        timeline.push({
          layoutFile: defaultFile,
          startTime: new Date(currentTime),
          endTime: new Date(currentTime.getTime() + dur * 1000),
          duration: dur,
          isDefault: true,
        });
        currentTime = new Date(currentTime.getTime() + dur * 1000);
      } else {
        // No default layout — skip ahead 1 minute
        currentTime = new Date(currentTime.getTime() + 60000);
      }
      continue;
    }

    // Round-robin through active layouts
    for (let i = 0; i < layoutFiles.length && currentTime < to && timeline.length < maxEntries; i++) {
      const file = layoutFiles[i];
      const dur = durations.get(file) || defaultDuration;
      const endTime = new Date(currentTime.getTime() + dur * 1000);

      timeline.push({
        layoutFile: file,
        startTime: new Date(currentTime),
        endTime,
        duration: dur,
        isDefault: false,
      });
      currentTime = endTime;

      // Re-evaluate schedule at this layout's end time — if the active set
      // changed (e.g., daypart boundary), break out and re-enter the outer loop
      const next = schedule.getLayoutsAtTime(currentTime);
      if (!arraysEqual(layoutFiles, next)) break;
    }
  }

  return timeline;
}
