/**
 * Schedule manager - determines which layouts to show
 */

export class ScheduleManager {
  constructor() {
    this.schedule = null;
  }

  /**
   * Update schedule from XMDS
   */
  setSchedule(schedule) {
    this.schedule = schedule;
  }

  /**
   * Get current layouts to display
   * Returns array of layout files, prioritized
   */
  getCurrentLayouts() {
    if (!this.schedule) {
      return [];
    }

    const now = new Date();
    const active = [];

    // Find all active scheduled layouts
    for (const layout of this.schedule.layouts) {
      const from = layout.fromdt ? new Date(layout.fromdt) : null;
      const to = layout.todt ? new Date(layout.todt) : null;

      if ((!from || now >= from) && (!to || now <= to)) {
        active.push(layout);
      }
    }

    // If no active schedules, return default
    if (active.length === 0) {
      return this.schedule.default ? [this.schedule.default] : [];
    }

    // Group by priority (higher = more important)
    const byPriority = {};
    let maxPriority = -Infinity;

    for (const layout of active) {
      const priority = layout.priority || 0;
      if (!byPriority[priority]) {
        byPriority[priority] = [];
      }
      byPriority[priority].push(layout.file);
      maxPriority = Math.max(maxPriority, priority);
    }

    // Return only the highest priority layouts
    return byPriority[maxPriority] || [];
  }

  /**
   * Check if schedule needs update (every minute)
   */
  shouldCheckSchedule(lastCheck) {
    if (!lastCheck) return true;
    const elapsed = Date.now() - lastCheck;
    return elapsed >= 60000; // 1 minute
  }
}

export const scheduleManager = new ScheduleManager();
