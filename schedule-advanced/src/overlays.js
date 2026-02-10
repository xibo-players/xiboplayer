/**
 * Overlay Layout Scheduler
 *
 * Manages overlay layouts that appear on top of main layouts.
 * Based on upstream electron-player implementation.
 *
 * Overlays:
 * - Render on top of main layout (higher z-index)
 * - Have scheduled start/end times
 * - Support priority ordering (multiple overlays)
 * - Support criteria-based display (future)
 * - Support geofencing (future)
 *
 * Reference: upstream_players/electron-player/src/main/xmds/response/schedule/events/overlayLayout.ts
 */

import { createLogger } from '@xiboplayer/utils';

const logger = createLogger('schedule-advanced:overlays');

/**
 * Overlay Scheduler
 * Handles overlay layouts that display on top of main layouts
 */
export class OverlayScheduler {
  constructor() {
    this.overlays = [];
    logger.debug('OverlayScheduler initialized');
  }

  /**
   * Update overlays from XMDS Schedule response
   * @param {Array} overlays - Overlay objects from XMDS
   */
  setOverlays(overlays) {
    this.overlays = overlays || [];
    logger.info(`Loaded ${this.overlays.length} overlay(s)`);
  }

  /**
   * Get currently active overlays
   * @returns {Array} Active overlay objects sorted by priority (highest first)
   */
  getCurrentOverlays() {
    if (!this.overlays || this.overlays.length === 0) {
      return [];
    }

    const now = new Date();
    const activeOverlays = [];

    for (const overlay of this.overlays) {
      // Check time window
      if (!this.isTimeActive(overlay, now)) {
        logger.debug(`Overlay ${overlay.file} not in time window`);
        continue;
      }

      // Check geo-awareness (future implementation)
      if (overlay.isGeoAware) {
        // TODO: Check if within geo-location
        // For now, skip geo-aware overlays
        logger.debug(`Skipping geo-aware overlay: ${overlay.file}`);
        continue;
      }

      // Check criteria (future implementation)
      if (overlay.criteria && overlay.criteria.length > 0) {
        // TODO: Evaluate criteria
        // For now, skip criteria-based overlays
        logger.debug(`Skipping criteria-based overlay: ${overlay.file}`);
        continue;
      }

      activeOverlays.push(overlay);
    }

    // Sort by priority (highest first)
    activeOverlays.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      return priorityB - priorityA;
    });

    if (activeOverlays.length > 0) {
      logger.info(`Active overlays: ${activeOverlays.length}`);
    }

    return activeOverlays;
  }

  /**
   * Check if overlay is within its time window
   * @param {Object} overlay - Overlay object
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  isTimeActive(overlay, now) {
    const from = overlay.fromDt ? new Date(overlay.fromDt) : null;
    const to = overlay.toDt ? new Date(overlay.toDt) : null;

    // Check time bounds
    if (from && now < from) {
      return false;
    }
    if (to && now > to) {
      return false;
    }

    return true;
  }

  /**
   * Check if overlay schedule needs update (every minute)
   * @param {number} lastCheck - Last check timestamp
   * @returns {boolean}
   */
  shouldCheckOverlays(lastCheck) {
    if (!lastCheck) return true;
    const elapsed = Date.now() - lastCheck;
    return elapsed >= 60000; // 1 minute
  }

  /**
   * Get overlay by file ID
   * @param {number} fileId - Layout file ID
   * @returns {Object|null}
   */
  getOverlayByFile(fileId) {
    return this.overlays.find(o => o.file === fileId) || null;
  }

  /**
   * Clear all overlays
   */
  clear() {
    this.overlays = [];
    logger.debug('Cleared all overlays');
  }

  /**
   * Process overlay layouts (compatibility method for interrupt scheduler pattern)
   * @param {Array} layouts - Base layouts
   * @param {Array} overlays - Overlay layouts
   * @returns {Array} Layouts (unchanged, overlays are separate)
   */
  processOverlays(layouts, overlays) {
    // Overlays don't modify the main layout loop
    // They are rendered separately on top
    this.setOverlays(overlays);
    return layouts;
  }
}

export const overlayScheduler = new OverlayScheduler();
