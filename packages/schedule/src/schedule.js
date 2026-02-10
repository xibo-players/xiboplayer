/**
 * Schedule manager - determines which layouts to show
 */

export class ScheduleManager {
  constructor(options = {}) {
    this.schedule = null;
    this.playHistory = new Map(); // Track plays per layout: layoutId -> [timestamps]
    this.interruptScheduler = options.interruptScheduler || null; // Optional interrupt scheduler
  }

  /**
   * Update schedule from XMDS
   */
  setSchedule(schedule) {
    this.schedule = schedule;
  }

  /**
   * Check if a schedule item is active based on recurrence rules
   * Supports weekly dayparting (recurring schedules on specific days/times)
   */
  isRecurringScheduleActive(item, now) {
    // If no recurrence, it's not a recurring schedule
    if (!item.recurrenceType) {
      return true; // Not a recurring schedule, use date/time checks instead
    }

    // Currently only support Weekly recurrence (dayparting)
    if (item.recurrenceType !== 'Week') {
      return true; // Unsupported recurrence type, fallback to date/time checks
    }

    // Check if current day of week matches recurrenceRepeatsOn
    // recurrenceRepeatsOn format: "1,2,3,4,5" (1=Monday, 7=Sunday, ISO format)
    if (item.recurrenceRepeatsOn) {
      const currentDayOfWeek = this.getIsoDayOfWeek(now);
      const allowedDays = item.recurrenceRepeatsOn.split(',').map(d => parseInt(d.trim()));

      if (!allowedDays.includes(currentDayOfWeek)) {
        return false; // Today is not in the allowed days
      }
    }

    // Check recurrence range if specified
    if (item.recurrenceRange) {
      const rangeEnd = new Date(item.recurrenceRange);
      if (now > rangeEnd) {
        return false; // Recurrence has ended
      }
    }

    return true;
  }

  /**
   * Get ISO day of week (1=Monday, 7=Sunday)
   */
  getIsoDayOfWeek(date) {
    const day = date.getDay(); // 0=Sunday, 6=Saturday
    return day === 0 ? 7 : day; // Convert to ISO (1=Monday, 7=Sunday)
  }

  /**
   * Check if current time is within the schedule's time window
   * Handles both date ranges and time-of-day for dayparting
   */
  isTimeActive(item, now) {
    const from = item.fromdt ? new Date(item.fromdt) : null;
    const to = item.todt ? new Date(item.todt) : null;

    // For recurring schedules, check time-of-day instead of full datetime
    if (item.recurrenceType === 'Week') {
      // Extract time from fromdt/todt and compare with current time
      if (from && to) {
        const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const fromTime = from.getHours() * 3600 + from.getMinutes() * 60 + from.getSeconds();
        const toTime = to.getHours() * 3600 + to.getMinutes() * 60 + to.getSeconds();

        // Handle midnight crossing
        if (fromTime <= toTime) {
          // Normal case: 09:00 - 17:00
          return currentTime >= fromTime && currentTime <= toTime;
        } else {
          // Midnight crossing: 22:00 - 02:00
          return currentTime >= fromTime || currentTime <= toTime;
        }
      }
      return true;
    }

    // For non-recurring schedules, use full date/time comparison
    if (from && now < from) return false;
    if (to && now > to) return false;
    return true;
  }

  /**
   * Get current layouts to display
   * Returns array of layout files, prioritized
   *
   * Campaign behavior:
   * - Priority applies at campaign level, not individual layout level
   * - All layouts in a campaign share the campaign's priority
   * - Layouts within a campaign are returned in order for cycling
   * - Standalone layouts compete with campaigns at their own priority
   *
   * Dayparting behavior:
   * - Schedules can recur weekly on specific days (recurrenceType='Week')
   * - recurrenceRepeatsOn specifies days: "1,2,3,4,5" (Mon-Fri, ISO format)
   * - Time matching uses time-of-day for recurring schedules
   * - Non-recurring schedules use full date/time ranges
   *
   * Interrupt behavior (shareOfVoice):
   * - Layouts with shareOfVoice > 0 are interrupts
   * - They must play for a percentage of each hour
   * - Normal layouts fill remaining time
   * - Interrupts are interleaved with normal layouts
   */
  getCurrentLayouts() {
    if (!this.schedule) {
      return [];
    }

    const now = new Date();
    const activeItems = []; // Mix of campaign objects and standalone layouts

    // Find all active campaigns
    if (this.schedule.campaigns) {
      for (const campaign of this.schedule.campaigns) {
        // Check recurrence and time window
        if (!this.isRecurringScheduleActive(campaign, now)) {
          continue;
        }
        if (!this.isTimeActive(campaign, now)) {
          continue;
        }

        // Campaign is active - add it as a single item with its priority
        activeItems.push({
          type: 'campaign',
          priority: campaign.priority,
          layouts: campaign.layouts, // Keep full layout objects for interrupt processing
          campaignId: campaign.id
        });
      }
    }

    // Find all active standalone layouts
    if (this.schedule.layouts) {
      for (const layout of this.schedule.layouts) {
        // Check recurrence and time window
        if (!this.isRecurringScheduleActive(layout, now)) {
          continue;
        }
        if (!this.isTimeActive(layout, now)) {
          continue;
        }

        // Check max plays per hour - but track that we filtered it
        if (!this.canPlayLayout(layout.id, layout.maxPlaysPerHour)) {
          console.log('[Schedule] Layout', layout.id, 'filtered by maxPlaysPerHour (limit:', layout.maxPlaysPerHour, ')');
          // Continue to check other layouts, but don't add this one
          continue;
        }

        activeItems.push({
          type: 'layout',
          priority: layout.priority || 0,
          layouts: [layout], // Keep full layout object for interrupt processing
          layoutId: layout.id
        });
      }
    }

    // If no active schedules, return default
    if (activeItems.length === 0) {
      return this.schedule.default ? [this.schedule.default] : [];
    }

    // Find maximum priority across all items (campaigns and layouts)
    let maxPriority = Math.max(...activeItems.map(item => item.priority));
    console.log('[Schedule] Max priority:', maxPriority, 'from', activeItems.length, 'active items');

    // Collect all layouts from items with max priority
    let allLayouts = [];
    for (const item of activeItems) {
      if (item.priority === maxPriority) {
        console.log('[Schedule] Including priority', item.priority, 'layouts:', item.layouts.map(l => l.file));
        // Add all layouts from this campaign or standalone layout
        allLayouts.push(...item.layouts);
      } else {
        console.log('[Schedule] Skipping priority', item.priority, '< max', maxPriority);
      }
    }

    // Process interrupts if interrupt scheduler is available
    if (this.interruptScheduler) {
      const { normalLayouts, interruptLayouts } = this.interruptScheduler.separateLayouts(allLayouts);

      if (interruptLayouts.length > 0) {
        console.log('[Schedule] Found', interruptLayouts.length, 'interrupt layouts with shareOfVoice');
        const processedLayouts = this.interruptScheduler.processInterrupts(normalLayouts, interruptLayouts);
        // Extract file IDs from processed layouts
        const result = processedLayouts.map(l => l.file);
        console.log('[Schedule] Final layouts (with interrupts):', result);
        return result;
      }
    }

    // No interrupts, return layout files
    const result = allLayouts.map(l => l.file);
    console.log('[Schedule] Final layouts:', result);
    return result;
  }

  /**
   * Check if schedule needs update (every minute)
   */
  shouldCheckSchedule(lastCheck) {
    if (!lastCheck) return true;
    const elapsed = Date.now() - lastCheck;
    return elapsed >= 60000; // 1 minute
  }

  /**
   * Check if layout has exceeded max plays per hour
   * @param {string} layoutId - Layout ID to check
   * @param {number} maxPlaysPerHour - Maximum plays allowed per hour (0 = unlimited)
   * @returns {boolean} True if layout can play, false if exceeded limit
   */
  canPlayLayout(layoutId, maxPlaysPerHour) {
    // If maxPlaysPerHour is 0 or undefined, unlimited plays
    if (!maxPlaysPerHour || maxPlaysPerHour === 0) {
      return true;
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Get play history for this layout
    const history = this.playHistory.get(layoutId) || [];

    // Filter to plays within the last hour
    const playsInLastHour = history.filter(timestamp => timestamp > oneHourAgo);

    // Check if under limit
    const canPlay = playsInLastHour.length < maxPlaysPerHour;

    if (!canPlay) {
      console.log(`[Schedule] Layout ${layoutId} has reached max plays per hour (${playsInLastHour.length}/${maxPlaysPerHour})`);
    }

    return canPlay;
  }

  /**
   * Record that a layout was played
   * @param {string} layoutId - Layout ID that was played
   */
  recordPlay(layoutId) {
    if (!this.playHistory.has(layoutId)) {
      this.playHistory.set(layoutId, []);
    }

    const history = this.playHistory.get(layoutId);
    history.push(Date.now());

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const cleaned = history.filter(timestamp => timestamp > oneHourAgo);
    this.playHistory.set(layoutId, cleaned);

    console.log(`[Schedule] Recorded play for layout ${layoutId} (${cleaned.length} plays in last hour)`);
  }

  /**
   * Clear play history (useful for testing or reset)
   */
  clearPlayHistory() {
    this.playHistory.clear();
    console.log('[Schedule] Play history cleared');
  }
}

export const scheduleManager = new ScheduleManager();
